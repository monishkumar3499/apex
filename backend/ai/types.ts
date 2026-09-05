/**
 * Shared shapes for every model client.
 *
 * These used to live in `openrouter.ts`, which made the Gemini client import
 * its types from a competitor's module. Now that there are eight providers
 * behind two dialects, the contract belongs in a file of its own.
 */

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Reasoning control.
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
  /**
   * Whose work this is — a user id, or `'shared'`.
   *
   * The provider gate round-robins between owners, so one learner's six-month
   * build cannot starve nineteen other people's single drill request. Omitting
   * it is safe; it just puts the call in the shared lane.
   */
  owner?: string;
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

/** Rough token estimate used when a provider omits the usage block. */
export const estimateTokens = (text: string): number => Math.ceil(text.length / 4);
