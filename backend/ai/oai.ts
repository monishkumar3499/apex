import { logger } from '../logger/pino';
import {
  ProviderError,
  RETRYABLE_STATUS,
  MODEL_FATAL_STATUS,
  parseRetryAfter,
  backoffMs,
} from './provider-error';
import { gateFor, sleep } from './resilience';
import { keyring } from './keyring';
import { PROVIDERS, providerEndpoint, type ProviderId } from './providers';
import {
  estimateTokens,
  type CompletionOptions,
  type CompletionResult,
  type Usage,
} from './types';

/**
 * One client for every OpenAI-compatible provider.
 *
 * Groq, Cerebras, Mistral, Cloudflare Workers AI, Together, GitHub Models and
 * OpenRouter all speak the same `/chat/completions` dialect. Writing seven
 * clients for that would mean maintaining the same seven awkward details seven
 * times over — the reasoning-token budget trap, providers that echo their
 * reasoning trace into `content`, `finish_reason: "length"` on a budget the
 * thinking pass ate, failures tunnelled inside a 200 response. Those are
 * dialect problems, not vendor problems, so they are solved once here.
 *
 * What *is* per-vendor lives in `providers.ts` (endpoint, auth, limits) and
 * `keyring.ts` (which key to spend). This file only decides how to talk.
 */

const DEFAULT_TIMEOUT_MS = 90_000;

/**
 * How long a request may sit waiting for rate-limit headroom before the router
 * is told to try a different provider instead.
 *
 * Six seconds is roughly the point at which moving to another vendor is faster
 * than waiting for this one — and with eight buckets, there is almost always
 * another vendor.
 */
const MAX_BUCKET_WAIT_MS = 6_000;

export class ProviderUnavailable extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly waitMs: number,
  ) {
    super(`${provider} has no rate-limit headroom for ~${Math.round(waitMs / 1000)}s`);
    this.name = 'ProviderUnavailable';
  }
}

function oaiError(
  provider: ProviderId,
  model: string,
  status: number,
  detail: string,
  retryAfterMs?: number,
): ProviderError {
  return new ProviderError(`${PROVIDERS[provider].label} ${status}: ${detail.slice(0, 400)}`, {
    provider,
    model,
    status,
    retryAfterMs,
    retryable: RETRYABLE_STATUS.has(status),
    fatalForModel: MODEL_FATAL_STATUS.has(status),
  });
}

function buildBody(
  provider: ProviderId,
  options: CompletionOptions,
  streaming: boolean,
  maxTokens: number,
) {
  const spec = PROVIDERS[provider];

  return JSON.stringify({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: maxTokens,
    stream: streaming,
    // Not universally supported: Cloudflare ignores it, and asking for usage on
    // a provider that does not send it costs nothing either way.
    ...(streaming ? { stream_options: { include_usage: true } } : {}),
    // Only ask for JSON mode where the provider honours it. Sending it to one
    // that does not is a 400, and the prompt already carries the schema.
    ...(options.json && spec.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    ...(options.reasoning ? { reasoning: options.reasoning } : {}),
  });
}

function withTimeout(signal: AbortSignal | undefined, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`timed out after ${ms}ms`)), ms);
  const onAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/**
 * Claim rate-limit headroom on one of the provider's keys.
 *
 * Throws `ProviderUnavailable` rather than waiting indefinitely, which is what
 * lets the router treat "this vendor is saturated" as a routing decision
 * instead of as latency. Being told to move on in 6ms beats being told to wait
 * 40 seconds.
 */
async function claimKey(provider: ProviderId, label?: string) {
  const ring = keyring(provider);
  if (ring.size === 0) {
    throw new ProviderError(`${PROVIDERS[provider].keyEnv} is not configured`, {
      provider,
      model: '-',
      status: 401,
      retryable: false,
      fatalForModel: true,
    });
  }

  const claim = await ring.acquire(MAX_BUCKET_WAIT_MS);
  if (!claim) {
    const wait = ring.waitMs();
    logger.debug({ provider, label, waitMs: wait }, 'ai.provider.no-headroom');
    throw new ProviderUnavailable(provider, wait);
  }
  return claim;
}

/**
 * Detect the two ways a reasoning model returns nothing useful.
 *
 * Some providers echo the reasoning trace into `content`. That is prose, not an
 * answer, and no amount of JSON repair will rescue it — observed on
 * `nvidia/nemotron-3.5-lightning:free`, which opens with "Here's a thinking
 * process:", hence the prefix check as well as the equality one.
 */
function reasoningLeaked(text: string, reasoning: string): boolean {
  return (
    (Boolean(reasoning) && text.trim() === reasoning.trim()) ||
    /^\s*(?:here'?s (?:a|my) (?:thinking|thought) process|okay,? (?:the user|so) )/i.test(text)
  );
}

/**
 * Non-streaming completion with bounded retries.
 *
 * Every call logs its token usage under a label (`llm.usage`) so the cost of a
 * plan build is auditable end to end.
 */
export async function completeOai(
  provider: ProviderId,
  options: CompletionOptions,
): Promise<CompletionResult> {
  const spec = PROVIDERS[provider];
  const retries = options.retries ?? 2;
  const started = Date.now();
  const endpoint = providerEndpoint(provider);
  const owner = options.owner ?? 'shared';

  let maxTokens = options.maxTokens ?? 2000;
  let lastError: unknown;
  // Cleared if the endpoint rejects the hint as mandatory-reasoning.
  let reasoningControl = options.reasoning;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { signal, done } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    // Which key served this attempt, so a 429 can be charged to that key alone.
    // Tracked as a plain index rather than the claim object: the key itself has
    // no business outliving the request that spent it.
    let keyIndex = -1;

    try {
      const response = await gateFor(provider).run(async () => {
        const claim = await claimKey(provider, options.label);
        keyIndex = claim.index;
        return fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${claim.key}`,
            ...(spec.headers?.() ?? {}),
          },
          body: buildBody(provider, { ...options, reasoning: reasoningControl }, false, maxTokens),
          signal,
        });
      }, owner);

      if (!response.ok) {
        const detail = await response.text();
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

        // Teach the bucket the real ceiling. This is the single most valuable
        // thing we learn from a failed call: the published RPM was wrong, and
        // every subsequent request should be paced against the observed one.
        if (response.status === 429 && keyIndex >= 0) {
          keyring(provider).penalise(keyIndex, retryAfterMs);
        }

        // Some endpoints mandate reasoning and 400 on any attempt to shape it.
        // Drop the hint and retry rather than failing the whole call.
        if (response.status === 400 && reasoningControl && /reasoning/i.test(detail)) {
          logger.warn(
            { label: options.label, provider, model: options.model },
            'endpoint mandates reasoning, retrying without the hint',
          );
          reasoningControl = undefined;
          continue;
        }

        const error = oaiError(provider, options.model, response.status, detail, retryAfterMs);
        if (error.retryable && attempt < retries) {
          // Free-tier upstreams stay rate-limited for seconds, not
          // milliseconds, so 429 backs off from a much larger base — and
          // honours Retry-After exactly when the upstream supplies it.
          const wait = retryAfterMs ?? backoffMs(attempt, response.status === 429 ? 4_000 : 700);
          logger.warn(
            { status: response.status, attempt, wait, label: options.label, provider, model: options.model },
            'transient upstream failure, retrying',
          );
          await sleep(wait);
          continue;
        }
        throw error;
      }

      if (keyIndex >= 0) keyring(provider).succeed(keyIndex);
      const data = await response.json();

      // OpenRouter (and Cloudflare) tunnel some upstream failures inside a 200.
      const tunnelled = data.error ?? (data.success === false ? data.errors?.[0] : undefined);
      if (tunnelled) {
        const status = Number(tunnelled.code) || 502;
        const error = oaiError(
          provider,
          options.model,
          status,
          tunnelled.message ?? 'upstream error',
        );
        if (status === 429 && keyIndex >= 0) keyring(provider).penalise(keyIndex);
        if (error.retryable && attempt < retries) {
          await sleep(backoffMs(attempt, status === 429 ? 4_000 : 900));
          continue;
        }
        throw error;
      }

      // Cloudflare wraps the OpenAI shape in `{ result: … }` on some routes.
      const payload = data.choices ? data : (data.result ?? data);
      const choice = payload.choices?.[0];
      const text: string = choice?.message?.content ?? '';
      const reasoning: string = choice?.message?.reasoning ?? '';
      const usageBlock = payload.usage ?? data.usage;
      const reasoningTokens: number = usageBlock?.completion_tokens_details?.reasoning_tokens ?? 0;

      const leaked = reasoningLeaked(text, reasoning);
      // `length` means the budget ran out mid-answer. On a reasoning model that
      // usually means thinking consumed it, so retry with real headroom rather
      // than handing a truncated fragment to the JSON repair path.
      const truncated = choice?.finish_reason === 'length';

      if (!text.trim() || leaked || truncated) {
        if (attempt < retries) {
          if (truncated || leaked) maxTokens = Math.min(Math.round(maxTokens * 2), 32_000);
          logger.warn(
            {
              attempt,
              label: options.label,
              provider,
              model: options.model,
              reason: leaked ? 'reasoning-leaked-into-content' : truncated ? 'truncated' : 'empty',
              reasoningTokens,
              nextMaxTokens: maxTokens,
            },
            'upstream returned unusable content, retrying',
          );
          await sleep(backoffMs(attempt, 500, 5_000));
          continue;
        }
        if (!text.trim() || leaked) {
          throw oaiError(
            provider,
            options.model,
            0,
            `no answer (${leaked ? 'reasoning leaked into content' : 'empty completion'}); ` +
              `${reasoningTokens} reasoning tokens used of a ${maxTokens} budget`,
          );
        }
        // Truncated but non-empty on the last attempt: json.ts can often still
        // close it, so pass it through rather than failing outright.
      }

      const usage: Usage = {
        promptTokens:
          usageBlock?.prompt_tokens ?? estimateTokens(options.messages.map((m) => m.content).join('')),
        completionTokens: usageBlock?.completion_tokens ?? estimateTokens(text),
        totalTokens: usageBlock?.total_tokens ?? 0,
      };
      if (!usage.totalTokens) usage.totalTokens = usage.promptTokens + usage.completionTokens;

      const ms = Date.now() - started;
      logger.info(
        { label: options.label, provider, model: options.model, ...usage, reasoningTokens, ms },
        'llm.usage',
      );

      return { text, usage, model: payload.model ?? options.model, ms };
    } catch (error) {
      lastError = error;
      if ((error as Error)?.name === 'AbortError' && options.signal?.aborted) throw error;
      // No headroom is a routing signal, not a fault. Retrying the same
      // saturated provider is exactly the wrong response.
      if (error instanceof ProviderUnavailable) throw error;
      if (error instanceof ProviderError && error.fatalForModel) throw error;
      if (attempt >= retries) break;
      await sleep(backoffMs(attempt, 600));
    } finally {
      done();
    }
  }

  logger.error(
    { error: lastError, label: options.label, provider, model: options.model },
    'completion failed',
  );
  throw lastError instanceof Error
    ? lastError
    : oaiError(provider, options.model, 0, 'completion failed for an unknown reason');
}

/**
 * Streaming completion. Yields content deltas as they arrive so the coach can
 * paint the first token in well under a second instead of blocking on the
 * whole reply.
 */
export async function* streamOai(
  provider: ProviderId,
  options: CompletionOptions,
): AsyncGenerator<string, Usage, void> {
  const spec = PROVIDERS[provider];
  const endpoint = providerEndpoint(provider);
  const maxTokens = options.maxTokens ?? 2000;
  const owner = options.owner ?? 'shared';

  // The gate covers connection setup only — holding a slot for the whole
  // stream would serialise the coach behind any in-flight build.
  const claimed = await gateFor(provider).run(() => claimKey(provider, options.label), owner);

  const fire = (body: string) =>
    fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${claimed.key}`,
        ...(spec.headers?.() ?? {}),
      },
      body,
      signal: options.signal,
    });

  let response = await fire(buildBody(provider, options, true, maxTokens));

  // Turning reasoning off is a large latency win, but some endpoints mandate it
  // and reject the request outright. Drop the hint and retry rather than
  // failing, so one model config stays portable across providers.
  if (response.status === 400 && options.reasoning) {
    const detail = await response.text().catch(() => '');
    if (/reasoning/i.test(detail)) {
      logger.warn(
        { label: options.label, provider, model: options.model },
        'endpoint mandates reasoning, retrying without the hint',
      );
      const { reasoning: _dropped, ...rest } = options;
      response = await fire(buildBody(provider, rest, true, maxTokens));
    } else {
      throw oaiError(provider, options.model, 400, detail);
    }
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    if (response.status === 429) keyring(provider).penalise(claimed.index, retryAfterMs);
    throw oaiError(provider, options.model, response.status, detail, retryAfterMs);
  }

  keyring(provider).succeed(claimed.index);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completion = '';
  let usage: Usage | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;

      const payload = trimmed.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      try {
        const parsed = JSON.parse(payload);
        const delta: string = parsed.choices?.[0]?.delta?.content ?? '';
        if (delta) {
          completion += delta;
          yield delta;
        }
        if (parsed.usage) {
          usage = {
            promptTokens: parsed.usage.prompt_tokens ?? 0,
            completionTokens: parsed.usage.completion_tokens ?? 0,
            totalTokens: parsed.usage.total_tokens ?? 0,
          };
        }
      } catch {
        // Providers interleave keep-alive comments (`: OPENROUTER PROCESSING`).
      }
    }
  }

  const final: Usage = usage ?? {
    promptTokens: estimateTokens(options.messages.map((m) => m.content).join('')),
    completionTokens: estimateTokens(completion),
    totalTokens: 0,
  };
  if (!final.totalTokens) final.totalTokens = final.promptTokens + final.completionTokens;

  logger.info({ label: options.label, provider, model: options.model, ...final }, 'llm.usage.stream');
  return final;
}

export { estimateTokens };
export type { CompletionOptions, CompletionResult, Usage, Message } from './types';
