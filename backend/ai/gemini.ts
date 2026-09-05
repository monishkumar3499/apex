import { logger } from '../logger/pino';
import type { CompletionOptions, CompletionResult, Usage } from './types';
import {
  ProviderError,
  RETRYABLE_STATUS,
  MODEL_FATAL_STATUS,
  parseRetryAfter,
  backoffMs,
} from './provider-error';
import { gateFor, sleep } from './resilience';
import { keyring } from './keyring';
import { ProviderUnavailable } from './oai';
import { estimateTokens } from './types';

export { estimateTokens };

/** Hard ceiling on a single call, so a wedged upstream cannot stall a build. */
const DEFAULT_TIMEOUT_MS = 75_000;

function cleanModelSlug(model: string): string {
  return model.replace(/^models\//, '').trim();
}

/**
 * Claim rate-limit headroom on one of the configured Gemini keys.
 *
 * `GEMINI_API_KEY` accepts a comma-separated list, and Google meters each entry
 * independently — so two keys are two 10-RPM allowances. On the tightest free
 * tier in the registry that is the difference between a 26-week blueprint
 * completing and stalling halfway.
 *
 * Throwing `ProviderUnavailable` rather than waiting is what lets the router
 * move the work to Groq or Cerebras instead of sitting in Google's queue.
 */
async function claimKey(label?: string): Promise<{ key: string; index: number }> {
  const ring = keyring('gemini');
  if (ring.size === 0) throw new Error('GEMINI_API_KEY is not configured');

  const claim = await ring.acquire(6_000);
  if (!claim) {
    const wait = ring.waitMs();
    logger.debug({ provider: 'gemini', label, waitMs: wait }, 'ai.provider.no-headroom');
    throw new ProviderUnavailable('gemini', wait);
  }
  return claim;
}

interface GeminiPart {
  text: string;
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiRequestBody {
  systemInstruction?: {
    parts: GeminiPart[];
  };
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    thinkingConfig?: { thinkingBudget: number };
  };
}

/**
 * Gemini 2.5 models think by default, and thinking is both slow and billed
 * against the response. For a blueprint the schema does the reasoning — the
 * model is filling in a structure, not solving a problem — so the thinking
 * pass buys nothing and costs a second or more per call.
 *
 * Measured on this project: `gemini-2.5-flash` answers a small JSON prompt in
 * ~1.4s with thinking on and ~0.9s with `thinkingBudget: 0`.
 *
 * Not every model accepts the field (a preview slug returned
 * `400 invalid argument`), so a rejection drops the hint and retries rather
 * than failing the call.
 */
function formatGeminiPayload(options: CompletionOptions, allowThinkingConfig: boolean): GeminiRequestBody {
  const systemMessages: string[] = [];
  const contents: GeminiContent[] = [];

  for (const msg of options.messages) {
    if (msg.role === 'system') {
      if (msg.content.trim()) systemMessages.push(msg.content);
    } else {
      const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
      const last = contents[contents.length - 1];
      if (last && last.role === role) {
        last.parts.push({ text: msg.content });
      } else {
        contents.push({ role, parts: [{ text: msg.content }] });
      }
    }
  }

  // Gemini requires at least one content entry.
  if (!contents.length) {
    contents.push({ role: 'user', parts: [{ text: ' ' }] });
  }

  // `thinking: false` (the default for structured work) turns the budget off.
  const wantsThinking = options.thinking === true;

  const body: GeminiRequestBody = {
    contents,
    generationConfig: {
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxTokens ?? 8000,
      ...(options.json ? { responseMimeType: 'application/json' } : {}),
      ...(allowThinkingConfig && !wantsThinking ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
    },
  };

  if (systemMessages.length > 0) {
    body.systemInstruction = {
      parts: systemMessages.map((text) => ({ text })),
    };
  }

  return body;
}

function geminiError(
  model: string,
  status: number,
  detail: string,
  retryAfterMs?: number,
): ProviderError {
  return new ProviderError(`Gemini ${status}: ${detail.slice(0, 400)}`, {
    provider: 'gemini',
    model,
    status,
    retryAfterMs,
    retryable: RETRYABLE_STATUS.has(status),
    fatalForModel: MODEL_FATAL_STATUS.has(status),
  });
}

/** Merge a caller's abort signal with our own timeout. */
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
 * Non-streaming completion against the Google Gemini API.
 *
 * Retries here are for *transient* failures on this model only. Choosing a
 * different model is the router's job — see `runWithFallback`.
 */
export async function completeGemini(options: CompletionOptions): Promise<CompletionResult> {
  const retries = options.retries ?? 2;
  const started = Date.now();
  const model = cleanModelSlug(options.model);
  const owner = options.owner ?? 'shared';

  let lastError: unknown;
  let allowThinkingConfig = true;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const { signal, done } = withTimeout(options.signal, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    // Which key served this attempt, so a 429 is charged to that key alone
    // rather than to the whole keyring.
    let keyIndex = -1;

    try {
      const response = await gateFor('gemini').run(async () => {
        const claim = await claimKey(options.label);
        keyIndex = claim.index;
        return fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${claim.key}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formatGeminiPayload(options, allowThinkingConfig)),
            signal,
          },
        );
      }, owner);

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));

        // Teach this key's bucket the real ceiling. Google's free tier enforces
        // something tighter than it publishes, and being told is the only way
        // to find out.
        if (response.status === 429 && keyIndex >= 0) {
          keyring('gemini').penalise(keyIndex, retryAfterMs);
        }

        // Some slugs reject thinkingConfig outright. Drop it and retry, so one
        // model config stays portable across the Gemini model family.
        if (response.status === 400 && allowThinkingConfig && /thinking|invalid argument/i.test(detail)) {
          logger.warn({ model, label: options.label }, 'gemini rejected thinkingConfig, retrying without it');
          allowThinkingConfig = false;
          continue;
        }

        const error = geminiError(model, response.status, detail, retryAfterMs);
        if (error.retryable && attempt < retries) {
          const wait = retryAfterMs ?? backoffMs(attempt, response.status === 429 ? 3_000 : 700);
          logger.warn(
            { status: response.status, attempt, wait, label: options.label, model },
            'gemini transient failure, retrying',
          );
          await sleep(wait);
          continue;
        }
        throw error;
      }

      if (keyIndex >= 0) keyring('gemini').succeed(keyIndex);

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const text: string = candidate?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';

      const usageMetadata = data.usageMetadata;
      const promptTokens =
        usageMetadata?.promptTokenCount ?? estimateTokens(options.messages.map((m) => m.content).join(''));
      const completionTokens = usageMetadata?.candidatesTokenCount ?? estimateTokens(text);
      const totalTokens = usageMetadata?.totalTokenCount ?? promptTokens + completionTokens;

      // MAX_TOKENS with empty text means thinking (or a long answer) consumed
      // the budget. Growing it beats handing an empty string to JSON repair.
      const truncated = candidate?.finishReason === 'MAX_TOKENS';
      if (!text.trim() && attempt < retries) {
        logger.warn(
          { attempt, model, label: options.label, finishReason: candidate?.finishReason },
          'gemini returned empty content, retrying',
        );
        if (truncated) options = { ...options, maxTokens: Math.min((options.maxTokens ?? 8000) * 2, 32_000) };
        await sleep(backoffMs(attempt, 500, 4_000));
        continue;
      }

      if (!text.trim()) {
        // A safety block is a refusal, not a transient fault; say which it was.
        const reason = candidate?.finishReason ?? data.promptFeedback?.blockReason ?? 'unknown';
        throw geminiError(model, 0, `empty completion (finishReason: ${reason})`);
      }

      const usage: Usage = { promptTokens, completionTokens, totalTokens };
      const ms = Date.now() - started;
      logger.info(
        { label: options.label, model, ...usage, ms, thoughtsTokens: usageMetadata?.thoughtsTokenCount },
        'llm.usage',
      );

      return { text, usage, model, ms };
    } catch (error) {
      lastError = error;
      if ((error as Error)?.name === 'AbortError' && options.signal?.aborted) throw error;
      // No headroom is a routing signal, not a fault: retrying the same
      // saturated key is exactly the wrong response.
      if (error instanceof ProviderUnavailable) throw error;
      if (error instanceof ProviderError && error.fatalForModel) throw error;
      if (attempt >= retries) break;
      await sleep(backoffMs(attempt, 600));
    } finally {
      done();
    }
  }

  logger.error({ error: lastError, label: options.label, model }, 'gemini completion failed');
  throw lastError instanceof Error
    ? lastError
    : geminiError(model, 0, 'completion failed for an unknown reason');
}

/**
 * Streaming completion against the Google Gemini API via SSE.
 */
export async function* streamGemini(options: CompletionOptions): AsyncGenerator<string, Usage, void> {
  const model = cleanModelSlug(options.model);
  const owner = options.owner ?? 'shared';

  // The gate covers connection setup only — holding a slot for the whole
  // stream would serialise the coach behind any in-flight build.
  const claim = await gateFor('gemini').run(() => claimKey(options.label), owner);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${claim.key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // A streamed reply is conversational; let the model think if it wants to.
      body: JSON.stringify(formatGeminiPayload(options, true)),
      signal: options.signal,
    },
  );

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
    if (response.status === 429) keyring('gemini').penalise(claim.index, retryAfterMs);
    throw geminiError(model, response.status, detail, retryAfterMs);
  }

  keyring('gemini').succeed(claim.index);

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let completion = '';
  let lastUsage: Usage | null = null;

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
        const parts = parsed.candidates?.[0]?.content?.parts ?? [];
        for (const part of parts) {
          if (part.text) {
            completion += part.text;
            yield part.text;
          }
        }
        if (parsed.usageMetadata) {
          lastUsage = {
            promptTokens: parsed.usageMetadata.promptTokenCount ?? 0,
            completionTokens: parsed.usageMetadata.candidatesTokenCount ?? 0,
            totalTokens: parsed.usageMetadata.totalTokenCount ?? 0,
          };
        }
      } catch {
        // Ignore an unparseable SSE line.
      }
    }
  }

  const final: Usage = lastUsage ?? {
    promptTokens: estimateTokens(options.messages.map((m) => m.content).join('')),
    completionTokens: estimateTokens(completion),
    totalTokens: 0,
  };
  if (!final.totalTokens) final.totalTokens = final.promptTokens + final.completionTokens;

  logger.info({ label: options.label, model, ...final }, 'llm.usage.stream');
  return final;
}

export type { Message } from './types';
