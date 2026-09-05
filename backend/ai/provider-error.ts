import type { ProviderId } from './providers';

/**
 * One error type for every upstream model failure.
 *
 * The router has to decide three different things from a failed call — retry
 * now, fall back to another model, or give up — and it cannot do that from a
 * string message. Carrying the HTTP status and the upstream's own `Retry-After`
 * is what makes "back off for exactly as long as the provider asked" possible
 * instead of guessing.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly info: {
      /**
       * Which upstream refused us. Widened from the original two to the whole
       * registry, because the router's job is now to move work *between*
       * vendors and it cannot do that if the error cannot name one.
       */
      provider: ProviderId;
      model: string;
      /** 0 when the request never got a response (DNS, timeout, socket). */
      status: number;
      /** Parsed from the `Retry-After` header, when the upstream sent one. */
      retryAfterMs?: number;
      /** True when retrying the *same* model could plausibly work. */
      retryable: boolean;
      /** True when the model itself is the problem, so fall back rather than retry. */
      fatalForModel: boolean;
    },
  ) {
    super(message);
    this.name = 'ProviderError';
  }

  get status() {
    return this.info.status;
  }

  get retryable() {
    return this.info.retryable;
  }

  /** Rate limited: the model is fine, it is just unavailable right now. */
  get rateLimited() {
    return this.info.status === 429;
  }

  /**
   * The model will not start working on its own.
   *
   * A retired slug (404), a malformed request for this endpoint (400) or a
   * rejected key (401/403) is not a transient blip — retrying it wastes the
   * learner's time and the next model in the chain is the only way forward.
   */
  get fatalForModel() {
    return this.info.fatalForModel;
  }
}

/** Statuses worth retrying against the same model. */
export const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);

/** Statuses that mean "this model is not going to work" — fall back instead. */
export const MODEL_FATAL_STATUS = new Set([400, 401, 403, 404, 413, 422]);

/**
 * `Retry-After` is either seconds or an HTTP date. Both appear in the wild.
 * Capped, because some upstreams return values measured in hours and a build
 * must not sit on one.
 */
export function parseRetryAfter(header: string | null, capMs = 60_000): number | undefined {
  if (!header) return undefined;

  const seconds = Number(header.trim());
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, capMs);

  const date = Date.parse(header);
  if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), capMs);

  return undefined;
}

/**
 * Exponential backoff with full jitter.
 *
 * Full jitter rather than "base * 2^n + small random": when several topics or
 * several learners hit a free endpoint at once, a deterministic schedule makes
 * them all retry in the same instant and re-trigger the same 429. Spreading
 * uniformly across the whole window is what actually breaks the lockstep.
 */
export function backoffMs(attempt: number, baseMs: number, capMs = 30_000): number {
  const window = Math.min(capMs, baseMs * 2 ** attempt);
  return Math.round(window * (0.25 + Math.random() * 0.75));
}
