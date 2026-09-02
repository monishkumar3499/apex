import { logger } from '../logger/pino';
import { ProviderError } from './provider-error';

/**
 * Two mechanisms that together stop the pipeline from rate-limiting itself.
 *
 * `ProviderGate` limits how *fast* requests leave, per provider. Free upstreams
 * cap requests per minute, and the pipeline naturally bursts — curation fires
 * every unit search at once, a drill run generates several topics. A burst of
 * eight concurrent calls trips a 20 RPM limit immediately, then every retry
 * lands inside the same penalty window.
 *
 * `ModelBreaker` remembers which models are currently unusable, so a model that
 * just returned 429 is *skipped* rather than retried. Without it a three-model
 * fallback chain still spends its whole retry budget on the first model.
 *
 * Both are module-level singletons: they only work if every call site shares
 * the same view of how loaded a provider is.
 */

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
  private queue: Array<() => void> = [];

  constructor(
    private readonly name: string,
    private config: GateConfig,
  ) {}

  /** Widen or tighten the gate at runtime (used when an upstream 429s). */
  configure(patch: Partial<GateConfig>) {
    this.config = { ...this.config, ...patch };
  }

  get pending() {
    return this.queue.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private async acquire(): Promise<void> {
    if (this.active >= this.config.concurrency) {
      // A deep queue means the gate, not the upstream, is the bottleneck —
      // worth seeing before someone concludes the model is slow.
      if (this.queue.length >= this.config.concurrency * 3) {
        logger.warn(
          { provider: this.name, queued: this.queue.length, concurrency: this.config.concurrency },
          'ai.gate.queue-deep',
        );
      }
      await new Promise<void>((resolve) => this.queue.push(resolve));
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
    const next = this.queue.shift();
    if (next) next();
  }
}

/**
 * Defaults tuned for free tiers, where the published limits are low and the
 * effective ones are lower. Override with AI_MAX_CONCURRENCY_* if a paid key
 * makes these needlessly slow.
 */
const gates: Record<'gemini' | 'openrouter', ProviderGate> = {
  gemini: new ProviderGate('gemini', {
    concurrency: envInt('AI_MAX_CONCURRENCY_GEMINI', 4),
    minIntervalMs: envInt('AI_MIN_INTERVAL_GEMINI_MS', 120),
  }),
  openrouter: new ProviderGate('openrouter', {
    // Free OpenRouter slugs are the tighter of the two by a wide margin.
    concurrency: envInt('AI_MAX_CONCURRENCY_OPENROUTER', 2),
    minIntervalMs: envInt('AI_MIN_INTERVAL_OPENROUTER_MS', 350),
  }),
};

export const gateFor = (provider: 'gemini' | 'openrouter') => gates[provider];

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

// ---------------------------------------------------------------------------

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.replace(/^["']|["']$/g, '').trim();
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
