import { logger } from '../logger/pino';
import {
  ProviderError,
  RETRYABLE_STATUS,
  MODEL_FATAL_STATUS,
  parseRetryAfter,
  backoffMs,
} from './provider-error';
import { gateFor, sleep } from './resilience';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * OpenRouter's reasoning control.
 *
 * Reasoning tokens are billed against the SAME `max_tokens` budget as the
 * answer, so a reasoning model handed a budget sized for a plain instruct
 * model spends it all thinking and returns `finish_reason: "length"` with
 * empty or truncated content. Capping effort — or excluding reasoning
 * entirely, where the endpoint permits it — keeps the budget for the answer.
 */
export interface ReasoningControl {
  effort?: 'low' | 'medium' | 'high';
  /** Generate reasoning but omit it from the response. */
  exclude?: boolean;
  /** Some endpoints mandate reasoning and reject this with a 400. */
  enabled?: boolean;
}

export interface CompletionOptions {
  model: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
  /** Free models rate-limit aggressively; these are retried with backoff. */
  retries?: number;
  signal?: AbortSignal;
  /** Label used in cost/telemetry logs. */
  label?: string;
  /** Omit to leave the model's own default in place. */
  reasoning?: ReasoningControl;
  /**
   * Gemini only. Defaults to off: structured generation is schema-filling, and
   * the thinking pass costs latency without improving the JSON.
   */
  thinking?: boolean;
  /** Per-call ceiling. Defaults to 75s. */
  timeoutMs?: number;
}

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CompletionResult {
  text: string;
  usage: Usage;
  model: string;
  ms: number;
}

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_TIMEOUT_MS = 90_000;

/** Rough token estimate used when a provider omits the usage block. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

function headers(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY?.replace(/^["']|["']$/g, '').trim();
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not configured');

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
    'X-Title': process.env.SITE_NAME || 'APEX',
  };
}

function buildBody(options: CompletionOptions, stream: boolean, maxTokens?: number) {
  return JSON.stringify({
    model: options.model,
    messages: options.messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: maxTokens ?? options.maxTokens ?? 2000,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    ...(options.reasoning ? { reasoning: options.reasoning } : {}),
  });
}

function openRouterError(
  model: string,
  status: number,
  detail: string,
  retryAfterMs?: number,
): ProviderError {
  return new ProviderError(`OpenRouter ${status}: ${detail.slice(0, 400)}`, {
    provider: 'openrouter',
    model,
    status,
    retryAfterMs,
    retryable: RETRYABLE_STATUS.has(status),
    fatalForModel: MODEL_FATAL_STATUS.has(status),
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
 * Non-streaming completion with bounded retries.
 *
 * Every call logs its token usage under a label (`llm.usage`) so the cost of a
 * plan build is auditable end to end.
 */
export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const retries = options.retries ?? 2;
  const started = Date.now();
  let maxTokens = options.maxTokens ?? 2000;
  let lastError: unknown;
  // Cleared if the endpoint rejects the hint as mandatory-reasoning.
  let reasoningControl = options.reasoning;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { signal, done } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await gateFor('openrouter').run(() =>
        fetch(ENDPOINT, {
          method: 'POST',
          headers: headers(),
          body: buildBody({ ...options, reasoning: reasoningControl }, false, maxTokens),
          signal,
        }),
      );

      if (!response.ok) {
        const detail = await response.text();
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

        // Some endpoints mandate reasoning and 400 on any attempt to shape it.
        // Drop the hint and retry rather than failing the whole call.
        if (response.status === 400 && reasoningControl && /reasoning/i.test(detail)) {
          logger.warn(
            { label: options.label, model: options.model },
            'endpoint mandates reasoning, retrying without the hint',
          );
          reasoningControl = undefined;
          continue;
        }

        const error = openRouterError(options.model, response.status, detail, retryAfterMs);
        if (error.retryable && attempt < retries) {
          // Free-tier upstreams stay rate-limited for seconds, not
          // milliseconds, so 429 backs off from a much larger base — and
          // honours Retry-After exactly when the upstream supplies it.
          const wait = retryAfterMs ?? backoffMs(attempt, response.status === 429 ? 4_000 : 700);
          logger.warn(
            { status: response.status, attempt, wait, label: options.label, model: options.model },
            'OpenRouter transient failure, retrying',
          );
          await sleep(wait);
          continue;
        }
        throw error;
      }

      const data = await response.json();

      // OpenRouter tunnels some upstream failures inside a 200 body.
      if (data.error) {
        const status = Number(data.error.code) || 502;
        const error = openRouterError(options.model, status, data.error.message ?? 'upstream error');
        if (error.retryable && attempt < retries) {
          await sleep(backoffMs(attempt, status === 429 ? 4_000 : 900));
          continue;
        }
        throw error;
      }

      const choice = data.choices?.[0];
      const text: string = choice?.message?.content ?? '';
      const reasoning: string = choice?.message?.reasoning ?? '';
      const reasoningTokens: number = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;

      // Some providers echo the reasoning trace into `content`. That is prose,
      // not an answer, and no amount of JSON repair will rescue it. Observed on
      // nvidia/nemotron-3.5-lightning:free, which opens with "Here's a
      // thinking process:" — hence the prefix check as well as the equality one.
      const leaked =
        (Boolean(reasoning) && text.trim() === reasoning.trim()) ||
        /^\s*(?:here'?s (?:a|my) (?:thinking|thought) process|okay,? (?:the user|so) )/i.test(text);

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
              model: options.model,
              reason: leaked ? 'reasoning-leaked-into-content' : truncated ? 'truncated' : 'empty',
              reasoningTokens,
              nextMaxTokens: maxTokens,
            },
            'OpenRouter returned unusable content, retrying',
          );
          await sleep(backoffMs(attempt, 500, 5_000));
          continue;
        }
        if (!text.trim() || leaked) {
          throw openRouterError(
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
          data.usage?.prompt_tokens ?? estimateTokens(options.messages.map((m) => m.content).join('')),
        completionTokens: data.usage?.completion_tokens ?? estimateTokens(text),
        totalTokens: data.usage?.total_tokens ?? 0,
      };
      if (!usage.totalTokens) usage.totalTokens = usage.promptTokens + usage.completionTokens;

      const ms = Date.now() - started;
      logger.info({ label: options.label, model: options.model, ...usage, reasoningTokens, ms }, 'llm.usage');

      return { text, usage, model: data.model ?? options.model, ms };
    } catch (error) {
      lastError = error;
      if ((error as Error)?.name === 'AbortError' && options.signal?.aborted) throw error;
      if (error instanceof ProviderError && error.fatalForModel) throw error;
      if (attempt >= retries) break;
      await sleep(backoffMs(attempt, 600));
    } finally {
      done();
    }
  }

  logger.error({ error: lastError, label: options.label, model: options.model }, 'OpenRouter completion failed');
  throw lastError instanceof Error
    ? lastError
    : openRouterError(options.model, 0, 'completion failed for an unknown reason');
}

/**
 * Streaming completion. Yields content deltas as they arrive so the coach can
 * paint the first token in well under a second instead of blocking on the
 * whole reply.
 */
export async function* stream(options: CompletionOptions): AsyncGenerator<string, Usage, void> {
  const fire = (body: string) =>
    gateFor('openrouter').run(() =>
      fetch(ENDPOINT, { method: 'POST', headers: headers(), body, signal: options.signal }),
    );

  let response = await fire(buildBody(options, true));

  // Turning reasoning off is a large latency win, but some endpoints mandate it
  // and reject the request outright. Drop the hint and retry rather than
  // failing, so one model config stays portable across providers.
  if (response.status === 400 && options.reasoning) {
    const detail = await response.text().catch(() => '');
    if (/reasoning/i.test(detail)) {
      logger.warn(
        { label: options.label, model: options.model },
        'endpoint mandates reasoning, retrying without the hint',
      );
      const { reasoning: _dropped, ...rest } = options;
      response = await fire(buildBody(rest, true));
    } else {
      throw openRouterError(options.model, 400, detail);
    }
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw openRouterError(
      options.model,
      response.status,
      detail,
      parseRetryAfter(response.headers.get('retry-after')),
    );
  }

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
      if (payload === '[DONE]') continue;

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
        // OpenRouter interleaves `: OPENROUTER PROCESSING` keep-alive comments.
      }
    }
  }

  const final: Usage = usage ?? {
    promptTokens: estimateTokens(options.messages.map((m) => m.content).join('')),
    completionTokens: estimateTokens(completion),
    totalTokens: 0,
  };
  if (!final.totalTokens) final.totalTokens = final.promptTokens + final.completionTokens;

  logger.info({ label: options.label, model: options.model, ...final }, 'llm.usage.stream');
  return final;
}
