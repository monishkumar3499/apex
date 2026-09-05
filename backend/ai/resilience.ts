import { logger } from '../logger/pino';
import { ProviderError } from './provider-error';
import { PROVIDERS, type ProviderId } from './providers';

/**
 * Four mechanisms that together stop the pipeline from rate-limiting itself.
 *
 * `TokenBucket` decides whether a request is allowed to leave *at all* right
 * now, and — the part that matters — **re-learns the real ceiling** from the
 * 429s the upstream sends back. A published limit is a claim; the observed
 * limit is a fact, and free tiers routinely enforce something tighter than
 * they document.
 *
 * `ProviderGate` limits how *fast* requests leave and how many run at once.
 * The pipeline naturally bursts — curation fires every unit search together, a
 * blueprint fans out into concurrent shards — and a burst is precisely what
 * trips a per-minute limit.
 *
 * `FairQueue` decides *whose* request leaves next. With twenty learners on one
 * shared free quota, a single six-month build submits hundreds of calls, and
 * FIFO ordering means the nineteen people who each wanted one drill card wait
 * behind all of them. Round-robin over users fixes that outright.
 *
 * `ModelBreaker` remembers which models are currently unusable, so a model
 * that just returned 429 is *skipped* rather than retried. Without it, a
 * ten-model fallback chain still spends its whole retry budget on the first
 * model.
 *
 * All four are module-level singletons: they only work if every call site
 * shares one view of how loaded each upstream is.
 */

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.replace(/^["']|["']$/g, '').trim();
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

// ---------------------------------------------------------------------------
// Adaptive token bucket
// ---------------------------------------------------------------------------

export interface BucketStats {
  /** Requests per minute the bucket currently believes it can sustain. */
  rpm: number;
  /** The configured ceiling it will grow back towards. */
  ceilingRpm: number;
  /** Whole requests available to spend immediately. */
  available: number;
  /** Requests spent in the current rolling day, when a daily cap applies. */
  spentToday: number;
  dailyLimit?: number;
  /** Epoch ms before which nothing may leave (an upstream Retry-After). */
  blockedUntil: number;
}

/**
 * A leaky bucket that halves its own rate when it is proven wrong.
 *
 * The refill rate starts at the provider's published free-tier RPM. Every 429
 * is evidence that the published number is not the real one, so the rate is
 * cut hard and immediately; every subsequent minute of clean traffic edges it
 * back up. Cutting fast and recovering slowly is the right asymmetry, because
 * the cost of guessing too high is a penalty window that also poisons the
 * retries landing inside it, while the cost of guessing too low is only some
 * latency.
 *
 * The daily counter exists because several of these vendors cap requests per
 * *day* as well as per minute, and a per-minute bucket alone will happily
 * spend a whole day's allowance inside an hour.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill = Date.now();
  private rate: number;
  private blockedUntil = 0;
  private spentToday = 0;
  private dayStart = Date.now();
  private lastPenalty = 0;

  constructor(
    private readonly name: string,
    private readonly ceilingRpm: number,
    private readonly dailyLimit?: number,
  ) {
    this.rate = ceilingRpm;
    // Start with a full burst allowance. A cold process should not be
    // artificially slow — the first few requests are exactly the ones a
    // learner is watching a spinner for.
    this.tokens = Math.max(1, Math.min(ceilingRpm, 10));
  }

  private refill() {
    const now = Date.now();

    // Rolling 24h window for the daily cap.
    if (now - this.dayStart >= 86_400_000) {
      this.dayStart = now;
      this.spentToday = 0;
    }

    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.lastRefill = now;

    this.tokens = Math.min(
      Math.max(1, Math.min(this.ceilingRpm, 10)),
      this.tokens + elapsed * (this.rate / 60),
    );

    // Creep the rate back towards the ceiling after a quiet penalty-free spell.
    // 45s of calm is roughly the length of a free tier's penalty window, so
    // recovering on that cadence probes the limit without hammering it.
    if (this.rate < this.ceilingRpm && now - this.lastPenalty > 45_000) {
      this.rate = Math.min(this.ceilingRpm, this.rate * 1.5 + 1);
      this.lastPenalty = now;
      logger.debug({ bucket: this.name, rpm: Math.round(this.rate) }, 'ai.bucket.recovering');
    }
  }

  /** Milliseconds until one request may leave; 0 when it may leave now. */
  waitMs(): number {
    this.refill();
    const now = Date.now();

    if (this.dailyLimit !== undefined && this.spentToday >= this.dailyLimit) {
      // The daily allowance is gone. Report the time to the window rolling over
      // so the router treats this provider as unusable rather than slow.
      return Math.max(1_000, this.dayStart + 86_400_000 - now);
    }

    const blocked = Math.max(0, this.blockedUntil - now);
    if (blocked > 0) return blocked;
    if (this.tokens >= 1) return 0;

    return Math.ceil(((1 - this.tokens) / (this.rate / 60)) * 1000);
  }

  /** Spend one request's worth of allowance. Call only after `waitMs()` is 0. */
  take() {
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
    this.spentToday++;
  }

  /**
   * Record that the upstream refused us.
   *
   * `retryAfterMs` is honoured verbatim when supplied — guessing shorter than
   * the provider asked just burns another request inside the same window, and
   * on some upstreams resets it.
   */
  penalise(retryAfterMs?: number) {
    const now = Date.now();
    this.lastPenalty = now;
    this.rate = Math.max(1, this.rate / 2);
    this.tokens = 0;
    this.blockedUntil = Math.max(this.blockedUntil, now + (retryAfterMs ?? 20_000));

    logger.warn(
      { bucket: this.name, rpm: Math.round(this.rate), blockedForMs: this.blockedUntil - now },
      'ai.bucket.throttled',
    );
  }

  /** Mark the daily allowance exhausted, when an upstream says so explicitly. */
  exhaustDaily() {
    if (this.dailyLimit !== undefined) this.spentToday = this.dailyLimit;
    else this.blockedUntil = Date.now() + 30 * 60_000;
  }

  get stats(): BucketStats {
    this.refill();
    return {
      rpm: Math.round(this.rate),
      ceilingRpm: this.ceilingRpm,
      available: Math.floor(this.tokens),
      spentToday: this.spentToday,
      dailyLimit: this.dailyLimit,
      blockedUntil: this.blockedUntil,
    };
  }

  /** Test seam. */
  reset() {
    this.rate = this.ceilingRpm;
    this.tokens = Math.max(1, Math.min(this.ceilingRpm, 10));
    this.blockedUntil = 0;
    this.spentToday = 0;
    this.dayStart = Date.now();
    this.lastRefill = Date.now();
    this.lastPenalty = 0;
  }
}

// ---------------------------------------------------------------------------
// Per-user fairness
// ---------------------------------------------------------------------------

/**
 * Round-robin over owners, FIFO within one owner.
 *
 * The scenario this exists for: one learner starts a six-month plan, which
 * submits several hundred model calls over a couple of minutes. Under FIFO
 * every other learner's single drill request sits behind that queue and the app
 * looks dead to nineteen people so that it can look fast to one.
 *
 * Round-robin makes wait time depend on how many *people* are active rather
 * than on how much work the busiest of them submitted.
 */
export class FairQueue {
  private lanes = new Map<string, Array<() => void>>();
  private order: string[] = [];
  private cursor = 0;
  private size = 0;

  get pending() {
    return this.size;
  }

  get owners() {
    return this.order.length;
  }

  /** Park the caller until its turn comes round. */
  wait(owner: string): Promise<void> {
    return new Promise<void>((resolve) => {
      let lane = this.lanes.get(owner);
      if (!lane) {
        lane = [];
        this.lanes.set(owner, lane);
        // Insert at the cursor so a newly-active owner is served next, rather
        // than after a full lap of everyone already queued.
        this.order.splice(this.cursor, 0, owner);
      }
      lane.push(resolve);
      this.size++;
    });
  }

  /** Release the next owner's oldest waiter. Returns false when empty. */
  next(): boolean {
    if (this.size === 0) return false;

    for (let i = 0; i < this.order.length; i++) {
      const owner = this.order[this.cursor % this.order.length];
      const lane = this.lanes.get(owner);

      if (lane && lane.length > 0) {
        const resolve = lane.shift()!;
        this.size--;
        if (lane.length === 0) {
          this.lanes.delete(owner);
          this.order.splice(this.cursor % this.order.length, 1);
          if (this.order.length > 0) this.cursor %= this.order.length;
          else this.cursor = 0;
        } else {
          this.cursor = (this.cursor + 1) % this.order.length;
        }
        resolve();
        return true;
      }

      // Empty lane left behind by a rejected waiter; drop it and keep looking.
      this.order.splice(this.cursor % this.order.length, 1);
      this.lanes.delete(owner);
      if (this.order.length === 0) {
        this.cursor = 0;
        break;
      }
      this.cursor %= this.order.length;
    }

    return false;
  }

  reset() {
    // Unblock anyone parked, or a test teardown deadlocks.
    for (const lane of this.lanes.values()) for (const resolve of lane) resolve();
    this.lanes.clear();
    this.order = [];
    this.cursor = 0;
    this.size = 0;
  }
}

// ---------------------------------------------------------------------------
// Rate gate
// ---------------------------------------------------------------------------

interface GateConfig {
  /** Requests allowed in flight at once. */
  concurrency: number;
  /** Minimum spacing between two request *starts*. */
  minIntervalMs: number;
}

export class ProviderGate {
  private active = 0;
  private lastStart = 0;
  private queue = new FairQueue();

  constructor(
    private readonly name: string,
    private config: GateConfig,
  ) {}

  /** Widen or tighten the gate at runtime (used when an upstream 429s). */
  configure(patch: Partial<GateConfig>) {
    this.config = { ...this.config, ...patch };
  }

  get pending() {
    return this.queue.pending;
  }

  /** How many distinct learners are waiting on this provider right now. */
  get waitingOwners() {
    return this.queue.owners;
  }

  async run<T>(task: () => Promise<T>, owner = 'shared'): Promise<T> {
    await this.acquire(owner);
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(owner: string): Promise<void> {
    if (this.active >= this.config.concurrency) {
      // A deep queue means the gate, not the upstream, is the bottleneck —
      // worth seeing before someone concludes the model is slow.
      if (this.queue.pending >= this.config.concurrency * 3) {
        logger.warn(
          {
            provider: this.name,
            queued: this.queue.pending,
            owners: this.queue.owners,
            concurrency: this.config.concurrency,
          },
          'ai.gate.queue-deep',
        );
      }
      await this.queue.wait(owner);
    }
    this.active++;

    // Space out starts even when a slot is free, so a burst of independent
    // callers becomes a stream instead of a spike.
    //
    // The reservation has to be claimed *synchronously*. Computing the wait and
    // only then assigning `lastStart` lets every concurrent acquirer read the
    // same value, all compute a wait of zero, and fire together — which is
    // precisely the burst this exists to prevent. Advancing `lastStart` before
    // the await gives each caller its own slot.
    const now = Date.now();
    const slot = Math.max(now, this.lastStart + this.config.minIntervalMs);
    this.lastStart = slot;
    if (slot > now) await sleep(slot - now);
  }

  private release() {
    this.active--;
    this.queue.next();
  }
}

/**
 * One gate and one bucket per provider, built from the registry.
 *
 * Sized from each vendor's published free-tier limits, then overridable — a
 * second or third key on a provider genuinely multiplies its ceiling, and
 * `keyring.ts` accounts for that by giving every key its own bucket.
 */
const gates = new Map<ProviderId, ProviderGate>();

export function gateFor(provider: ProviderId): ProviderGate {
  const existing = gates.get(provider);
  if (existing) return existing;

  const spec = PROVIDERS[provider];
  const upper = provider.toUpperCase();
  const gate = new ProviderGate(provider, {
    concurrency: envInt(`AI_MAX_CONCURRENCY_${upper}`, spec?.concurrency ?? 3),
    // Spacing derived from the provider's own RPM: a request every 60/rpm
    // seconds is, by definition, the pace the upstream said it can take.
    minIntervalMs: envInt(
      `AI_MIN_INTERVAL_${upper}_MS`,
      spec ? Math.max(60, Math.floor(60_000 / Math.max(1, spec.rpm)) / 2) : 200,
    ),
  });

  gates.set(provider, gate);
  return gate;
}

/** Snapshot of every live gate, for /api/health. */
export const gateSnapshot = () =>
  [...gates.entries()].map(([provider, gate]) => ({
    provider,
    queued: gate.pending,
    waitingLearners: gate.waitingOwners,
  }));

// ---------------------------------------------------------------------------
// Per-model circuit breaker
// ---------------------------------------------------------------------------

interface BreakerEntry {
  /** Epoch ms before which this model must not be called. */
  cooldownUntil: number;
  consecutiveFailures: number;
  lastError?: string;
}

class ModelBreaker {
  private state = new Map<string, BreakerEntry>();

  /** Is this model callable right now? */
  available(model: string): boolean {
    const entry = this.state.get(model);
    return !entry || entry.cooldownUntil <= Date.now();
  }

  /** Milliseconds until this model is usable again; 0 when it already is. */
  cooldownRemaining(model: string): number {
    const entry = this.state.get(model);
    if (!entry) return 0;
    return Math.max(0, entry.cooldownUntil - Date.now());
  }

  recordSuccess(model: string) {
    // One clean call clears the record entirely. A model that recovered should
    // not carry a penalty into the next build.
    this.state.delete(model);
  }

  recordFailure(model: string, error: unknown): number {
    const entry = this.state.get(model) ?? { cooldownUntil: 0, consecutiveFailures: 0 };
    entry.consecutiveFailures++;
    entry.lastError = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);

    const cooldown = cooldownFor(entry.consecutiveFailures, error);
    entry.cooldownUntil = Date.now() + cooldown;
    this.state.set(model, entry);

    logger.warn(
      { model, failures: entry.consecutiveFailures, cooldownMs: cooldown, error: entry.lastError },
      'ai.breaker.open',
    );
    return cooldown;
  }

  /** For diagnostics — /api/health can show why a tier is falling back. */
  snapshot() {
    const now = Date.now();
    return [...this.state.entries()].map(([model, entry]) => ({
      model,
      cooldownMs: Math.max(0, entry.cooldownUntil - now),
      failures: entry.consecutiveFailures,
      lastError: entry.lastError,
    }));
  }

  /** Test seam. */
  reset() {
    this.state.clear();
  }
}

/**
 * How long to sideline a model.
 *
 * A rate limit is respected exactly as asked when the upstream says so, because
 * guessing shorter just burns another request inside the penalty window. Other
 * failures escalate, and a model whose slug is simply wrong is parked for long
 * enough that a whole build stops paying for the discovery.
 */
function cooldownFor(failures: number, error: unknown): number {
  if (error instanceof ProviderError) {
    if (error.info.retryAfterMs !== undefined) {
      return Math.max(error.info.retryAfterMs, 1_000);
    }
    if (error.rateLimited) {
      return Math.min(15_000 * failures, 90_000);
    }
    if (error.fatalForModel) {
      // A retired slug or a rejected key will not fix itself mid-build.
      return 10 * 60_000;
    }
  }
  return Math.min(4_000 * 2 ** (failures - 1), 60_000);
}

export const breaker = new ModelBreaker();
