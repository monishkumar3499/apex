import { complete, stream, type CompletionOptions, type Message, type Usage } from './openrouter';
import { parseModelJson, JsonParseError } from './json';
import { logger } from '../logger/pino';

/**
 * Model tiers.
 *
 * Routing by *job size* rather than by agent name is what keeps the bill down:
 * classification is a 200-token job and must never hit the same model as the
 * 1500-token structure generation.
 */
export type Tier = 'nano' | 'structured' | 'chat';

/**
 * Fallbacks used when the matching env var is unset.
 *
 * Model slugs on OpenRouter are not stable — `openai/gpt-oss-120b:free` was
 * withdrawn from the free tier and now 404s. `GET /api/health` probes whatever
 * is actually configured so a retired slug surfaces as a failed health check
 * instead of as silently degraded plan quality.
 */
const DEFAULTS: Record<Tier, string> = {
  nano: 'minimax/minimax-m3:free',
  structured: 'minimax/minimax-m3:free',
  chat: 'minimax/minimax-m3:free',
};

export function modelFor(tier: Tier): string {
  const override =
    tier === 'nano' ? process.env.NANO_MODEL
    : tier === 'structured' ? process.env.STRUCTURED_MODEL || process.env.PLANNING_MODEL
    : process.env.CHAT_MODEL || process.env.QUERY_MODEL;

  return override?.trim() || DEFAULTS[tier];
}

/** Token spend accumulated across one logical operation (e.g. a plan build). */
export class TokenLedger {
  private entries: Array<{ label: string; usage: Usage }> = [];

  add(label: string, usage: Usage) {
    this.entries.push({ label, usage });
  }

  get total(): Usage {
    return this.entries.reduce(
      (acc, e) => ({
        promptTokens: acc.promptTokens + e.usage.promptTokens,
        completionTokens: acc.completionTokens + e.usage.completionTokens,
        totalTokens: acc.totalTokens + e.usage.totalTokens,
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    );
  }

  get breakdown() {
    return this.entries.map((e) => ({ label: e.label, tokens: e.usage.totalTokens }));
  }
}

export interface RunOptions extends Omit<CompletionOptions, 'model'> {
  tier: Tier;
  ledger?: TokenLedger;
}

export async function run(options: RunOptions): Promise<string> {
  const { tier, ledger, ...rest } = options;
  const result = await complete({ ...rest, model: modelFor(tier), label: options.label ?? tier });
  ledger?.add(options.label ?? tier, result.usage);
  return result.text;
}

export function runStream(options: RunOptions) {
  const { tier, ledger, ...rest } = options;
  return stream({ ...rest, model: modelFor(tier), label: options.label ?? tier });
}

/**
 * Run a completion that must return JSON.
 *
 * The repair retry is deliberately terse: it re-sends the schema reminder and
 * the broken fragment rather than the whole original prompt, which costs a
 * fraction of a naive full retry.
 */
export async function runJson<T>(
  options: RunOptions & { schemaHint?: string; validate?: (value: unknown) => value is T },
): Promise<T> {
  const { schemaHint, validate, ...runOpts } = options;
  const first = await run({ ...runOpts, json: true });

  try {
    const parsed = parseModelJson<T>(first);
    if (validate && !validate(parsed)) throw new JsonParseError('Schema validation failed', first);
    return parsed;
  } catch (error) {
    logger.warn({ label: options.label, error: (error as Error).message }, 'JSON parse failed, attempting repair pass');

    const repairMessages: Message[] = [
      {
        role: 'system',
        content:
          'You repair malformed JSON. Output ONLY the corrected JSON object. No prose, no code fences.' +
          (schemaHint ? `\nIt must match this shape:\n${schemaHint}` : ''),
      },
      { role: 'user', content: first.slice(0, 6000) },
    ];

    // Repair on the SAME tier that produced the output. Routing this to nano
    // meant a broken nano model turned every recoverable parse failure on the
    // structured tier into a hard build failure.
    const repaired = await run({
      ...runOpts,
      messages: repairMessages,
      json: true,
      temperature: 0,
      label: `${options.label ?? options.tier}:repair`,
    });

    const parsed = parseModelJson<T>(repaired);
    if (validate && !validate(parsed)) throw new JsonParseError('Schema validation failed after repair', repaired);
    return parsed;
  }
}

export type { Message, Usage };
