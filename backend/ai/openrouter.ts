import { logger } from '../logger/pino';

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
const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Rough token estimate used when a provider omits the usage block. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

function headers(): Record<string, string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
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
    ...(options.json ? { response_format: { type: 'json_object' } } : {}),
    ...(options.reasoning ? { reasoning: options.reasoning } : {}),
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Non-streaming completion with bounded retries.
 *
 * Every call logs its token usage under a label (`llm.usage`) so the cost of a
 * plan build is auditable end to end.
 */
export async function complete(options: CompletionOptions): Promise<CompletionResult> {
  const retries = options.retries ?? 2;
  const started = Date.now();
  const baseMaxTokens = options.maxTokens ?? 2000;
  let maxTokens = baseMaxTokens;
  let lastError: unknown;
  // Cleared if the endpoint rejects the hint as mandatory-reasoning.
  let reasoningControl = options.reasoning;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: headers(),
        body: buildBody({ ...options, reasoning: reasoningControl }, false, maxTokens),
        signal: options.signal,
      });

      if (!response.ok) {
        const detail = await response.text();

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

        if (RETRYABLE.has(response.status) && attempt < retries) {
          // Free-tier upstreams stay rate-limited for seconds, not milliseconds,
          // so 429 backs off far harder than a generic transient failure.
          const backoff =
            response.status === 429
              ? 4_000 * 2 ** attempt + Math.random() * 1_000
              : 700 * 2 ** attempt + Math.random() * 300;
          logger.warn(
            { status: response.status, attempt, backoff, label: options.label },
            'OpenRouter transient failure, retrying',
          );
          await sleep(backoff);
          continue;
        }
        throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 400)}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      const text: string = choice?.message?.content ?? '';
      const reasoning: string = choice?.message?.reasoning ?? '';
      const reasoningTokens: number = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;

      // Some providers echo the reasoning trace into `content`. That is prose,
      // not an answer, and no amount of JSON repair will rescue it.
      const leaked = Boolean(reasoning) && text === reasoning;

      // `length` means the budget ran out mid-answer. On a reasoning model that
      // usually means thinking consumed it, so retry with real headroom rather
      // than handing a truncated fragment to the JSON repair path.
      const truncated = choice?.finish_reason === 'length';

      if (!text.trim() || leaked || truncated) {
        if (attempt < retries) {
          const grow = truncated || leaked;
          if (grow) maxTokens = Math.min(Math.round(maxTokens * 2), 32_000);
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
          await sleep(500 * (attempt + 1));
          continue;
        }
        if (!text.trim() || leaked) {
          throw new Error(
            `OpenRouter returned no answer (${leaked ? 'reasoning leaked into content' : 'empty completion'}); ` +
              `${reasoningTokens} reasoning tokens used of a ${maxTokens} budget`,
          );
        }
        // Truncated but non-empty on the last attempt: json.ts can often
        // still close it, so pass it through rather than failing outright.
      }

      const usage: Usage = {
        promptTokens: data.usage?.prompt_tokens ?? estimateTokens(options.messages.map((m) => m.content).join('')),
        completionTokens: data.usage?.completion_tokens ?? estimateTokens(text),
        totalTokens: data.usage?.total_tokens ?? 0,
      };
      if (!usage.totalTokens) usage.totalTokens = usage.promptTokens + usage.completionTokens;

      const ms = Date.now() - started;
      logger.info(
        { label: options.label, model: options.model, ...usage, reasoningTokens, ms },
        'llm.usage',
      );

      return { text, usage, model: data.model ?? options.model, ms };
    } catch (error) {
      lastError = error;
      if ((error as Error)?.name === 'AbortError') throw error;
      if (attempt >= retries) break;
      await sleep(600 * 2 ** attempt);
    }
  }

  logger.error({ error: lastError, label: options.label }, 'OpenRouter completion failed');
  throw lastError instanceof Error ? lastError : new Error('OpenRouter completion failed');
}

/**
 * Streaming completion. Yields content deltas as they arrive so the coach can
 * paint the first token in well under a second instead of blocking on the
 * whole reply.
 */
export async function* stream(options: CompletionOptions): AsyncGenerator<string, Usage, void> {
  let response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: headers(),
    body: buildBody(options, true),
    signal: options.signal,
  });

  // Turning reasoning off is a large latency win, but some endpoints mandate it
  // and reject the request outright. Drop the hint and retry rather than
  // failing, so one model config stays portable across providers.
  if (response.status === 400 && options.reasoning) {
    const detail = await response.text().catch(() => '');
    if (/reasoning/i.test(detail)) {
      logger.warn({ label: options.label, model: options.model }, 'endpoint mandates reasoning, retrying without the hint');
      const { reasoning: _dropped, ...rest } = options;
      response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: headers(),
        body: buildBody(rest, true),
        signal: options.signal,
      });
    } else {
      throw new Error(`OpenRouter 400: ${detail.slice(0, 400)}`);
    }
  }

  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => '');
    throw new Error(`OpenRouter ${response.status}: ${detail.slice(0, 400)}`);
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
