import { logger } from '../logger/pino';
import { PROVIDERS, keysFor, type ProviderId } from './providers';
import { TokenBucket, sleep } from './resilience';

/**
 * Key rotation.
 *
 * Free quota is metered **per API key**. The upstream has no idea that three
 * keys belong to one deployment, so `GROQ_API_KEY="gsk_a,gsk_b,gsk_c"` is
 * genuinely three times the allowance — the cheapest capacity increase
 * available to this project, and a config change rather than a code change.
 *
 * Each key therefore gets its own adaptive bucket. Requests go to whichever key
 * can serve one soonest, and a key that 429s is penalised **alone**: the other
 * keys are not implicated by one key's exhaustion, and treating them as if they
 * were is how a multi-key setup ends up no faster than a single-key one.
 *
 * A key is chosen at *acquire* time rather than pinned per request, because the
 * useful question is "who can take this now", and that answer changes between
 * one call and the next.
 */

interface KeySlot {
  key: string;
  /** Index in the configured list; used in logs, never the key itself. */
  index: number;
  bucket: TokenBucket;
  consecutive429: number;
}

class ProviderKeyring {
  private slots: KeySlot[] = [];
  private signature = '';
  private cursor = 0;

  constructor(private readonly provider: ProviderId) {}

  /**
   * Rebuild the slots when the configured keys change.
   *
   * Env is read lazily rather than at import time: Next evaluates server
   * modules before `.env` is necessarily in place, and a keyring built from an
   * empty env at import would stay empty for the process lifetime.
   */
  private sync(): KeySlot[] {
    const keys = keysFor(this.provider);
    const signature = keys.map((k) => k.slice(-6)).join('|');
    if (signature === this.signature && this.slots.length === keys.length) return this.slots;

    const spec = PROVIDERS[this.provider];
    const previous = new Map(this.slots.map((slot) => [slot.key, slot]));

    this.slots = keys.map((key, index) => {
      // Preserve a surviving key's learned rate across a re-read. Throwing away
      // what we know about the live ceiling because an unrelated key was added
      // would re-trigger the exact 429s the bucket had just learned to avoid.
      const kept = previous.get(key);
      if (kept) return { ...kept, index };

      return {
        key,
        index,
        bucket: new TokenBucket(`${this.provider}#${index}`, spec.rpm, spec.rpd),
        consecutive429: 0,
      };
    });

    this.signature = signature;
    if (keys.length > 0) {
      logger.debug({ provider: this.provider, keys: keys.length }, 'ai.keyring.synced');
    }
    return this.slots;
  }

  get size() {
    return this.sync().length;
  }

  /**
   * Shortest wait across every key — how long before this provider can serve
   * anything at all.
   *
   * The router uses this to order a fallback chain, so a provider whose whole
   * keyring is cooling down loses its place to one that is ready, without
   * being dropped from the chain entirely.
   */
  waitMs(): number {
    const slots = this.sync();
    if (slots.length === 0) return Number.POSITIVE_INFINITY;
    return Math.min(...slots.map((slot) => slot.bucket.waitMs()));
  }

  /**
   * Reserve capacity on the best available key, waiting if necessary.
   *
   * Ties are broken round-robin. Always picking the first ready key would send
   * every request to key #0 whenever the keyring is idle, which is most of the
   * time — so the second and third keys would sit unused until the first was
   * already in trouble.
   */
  async acquire(maxWaitMs: number): Promise<{ key: string; index: number } | null> {
    const slots = this.sync();
    if (slots.length === 0) return null;

    const ready: KeySlot[] = [];
    let soonest: { slot: KeySlot; wait: number } | null = null;

    for (const slot of slots) {
      const wait = slot.bucket.waitMs();
      if (wait === 0) ready.push(slot);
      if (!soonest || wait < soonest.wait) soonest = { slot, wait };
    }

    if (ready.length > 0) {
      const slot = ready[this.cursor++ % ready.length];
      slot.bucket.take();
      return { key: slot.key, index: slot.index };
    }

    if (!soonest || soonest.wait > maxWaitMs) return null;

    // Nothing is free but something will be soon enough to be worth waiting
    // for. Waiting here — before the request is built — is strictly better than
    // firing it and being told to wait by a 429, which costs a round trip and,
    // on several of these providers, extends the penalty window.
    await sleep(soonest.wait);
    soonest.slot.bucket.take();
    return { key: soonest.slot.key, index: soonest.slot.index };
  }

  /** Record that this key was rate limited. */
  penalise(index: number, retryAfterMs?: number) {
    const slot = this.sync().find((s) => s.index === index);
    if (!slot) return;

    slot.consecutive429++;
    slot.bucket.penalise(retryAfterMs);

    // Repeated 429s with no Retry-After on the same key usually mean a *daily*
    // allowance is gone, not a per-minute one. Per-minute backoff never clears
    // that, so stop pretending it will and take the key out of rotation.
    if (slot.consecutive429 >= 3 && retryAfterMs === undefined) {
      logger.warn(
        { provider: this.provider, key: slot.index },
        'ai.keyring.daily-exhausted-suspected',
      );
      slot.bucket.exhaustDaily();
    }
  }

  /** Record a clean call, which clears the key's 429 streak. */
  succeed(index: number) {
    const slot = this.sync().find((s) => s.index === index);
    if (slot) slot.consecutive429 = 0;
  }

  snapshot() {
    return this.sync().map((slot) => ({
      key: `#${slot.index}`,
      // Last four characters only. Enough to tell two keys apart in a log,
      // useless to anyone who reads the log.
      fingerprint: slot.key.slice(-4),
      ...slot.bucket.stats,
      waitMs: slot.bucket.waitMs(),
    }));
  }

  reset() {
    for (const slot of this.slots) slot.bucket.reset();
  }
}

const rings = new Map<ProviderId, ProviderKeyring>();

export function keyring(provider: ProviderId): ProviderKeyring {
  const existing = rings.get(provider);
  if (existing) return existing;
  const ring = new ProviderKeyring(provider);
  rings.set(provider, ring);
  return ring;
}

/** How long before `provider` can serve a request. Infinity when unconfigured. */
export const providerWaitMs = (provider: ProviderId): number => keyring(provider).waitMs();

/** Full rate-limit picture across every configured provider, for /api/health. */
export const keyringSnapshot = () =>
  [...rings.entries()]
    .filter(([, ring]) => ring.size > 0)
    .map(([provider, ring]) => ({ provider, keys: ring.snapshot() }));

/** Test seam. */
export const resetKeyrings = () => {
  for (const ring of rings.values()) ring.reset();
};

export type { ProviderKeyring };
