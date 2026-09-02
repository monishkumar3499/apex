import { complete, stream, type CompletionOptions, type Message, type Usage } from './openrouter';
import { completeGemini, streamGemini } from './gemini';
import { parseModelJson, JsonParseError } from './json';
import { ProviderError } from './provider-error';
import { breaker, sleep } from './resilience';
import { logger } from '../logger/pino';

/**
 * Model tiers.
 *
 * Routing by *job size* rather than by agent name is what keeps the bill down:
 * classification is a 200-token job and must never hit the same model as the
 * 1500-token structure generation.
 */
export type Tier = 'nano' | 'structured' | 'chat';
export type Provider = 'gemini' | 'openrouter';

/**
 * Fallback chains, in preference order.
 *
 * Every entry was probed against the live APIs before being listed here,
 * because a chain full of retired slugs is worse than no chain — it turns one
 * failure into four, each with its own retry budget.
 *
 *   nano       classification + JSON repair    → Minimax, cheap and fast
 *   structured blueprints + drills             → Gemini, the most reliable JSON
 *   chat       the coach                       → Minimax, fluent and streams well
 *
 * Each chain deliberately **crosses providers**. Free tiers do not fail one
 * model at a time: a Google-side quota exhaustion takes out every Gemini slug
 * at once, so a chain of three Gemini models is a chain of one. The last entry
 * in each chain is always the other vendor.
 *
 * Rejected during probing, for the record:
 *   • google/gemma-4-*:free              — 429 on a cold request
 *   • nvidia/nemotron-3.5-lightning:free — 16s, and leaks its reasoning trace
 *                                          into `content`
 */
const CHAINS: Record<Tier, string[]> = {
  nano: ['minimax/minimax-m3:free', 'gemini-2.5-flash-lite', 'minimax/minimax-m2.7:free'],
  structured: ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'minimax/minimax-m3:free'],
  chat: ['minimax/minimax-m3:free', 'gemini-2.5-flash', 'z-ai/glm-5.2:free'],
};

const clean = (value?: string) => value?.replace(/^["']|["']$/g, '').trim();

/** The primary model for a tier — what the env var overrides. */
export function modelFor(tier: Tier): string {
  return chainFor(tier)[0];
}

/**
 * The full ordered chain for a tier.
 *
 * `NANO_MODEL` / `STRUCTURED_MODEL` / `CHAT_MODEL` accept a comma-separated
 * list, so an operator can reorder or extend a chain without a deploy. A single
 * value is promoted to the head of the built-in chain rather than replacing it:
 * overriding the primary model should not silently discard every fallback.
 */
export function chainFor(tier: Tier): string[] {
  const override =
    tier === 'nano'
      ? process.env.NANO_MODEL
      : tier === 'structured'
        ? process.env.STRUCTURED_MODEL || process.env.PLANNING_MODEL
        : process.env.CHAT_MODEL || process.env.QUERY_MODEL;

  const configured = (clean(override) ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter(Boolean);

  const ordered = [...configured, ...CHAINS[tier]];
  return [...new Set(ordered)];
}

export function providerFor(model: string, tier?: Tier): Provider {
  const slug = model.toLowerCase();
  if (slug.includes('gemini') || slug.startsWith('models/gemini')) return 'gemini';
  // A bare slug with no vendor prefix is a Google model name, not an
  // OpenRouter route (those always look like "vendor/model").
  if (!slug.includes('/') && tier === 'structured') return 'gemini';
  return 'openrouter';
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
  /** Pin to one model and skip the chain. Used by the repair pass. */
  model?: string;
  /** Called when a fallback is used, so the build can narrate the degradation. */
  onFallback?: (info: { from: string; to: string; reason: string }) => void;
}

/**
 * Order a chain by what is actually callable right now.
 *
 * Models whose breaker is open move to the back rather than being dropped: if
 * every model in a chain is cooling down, the least-cooled one is still a
 * better answer than failing the build outright.
 */
function orderByAvailability(chain: string[]): string[] {
  const ready = chain.filter((m) => breaker.available(m));
  const cooling = chain
    .filter((m) => !breaker.available(m))
    .sort((a, b) => breaker.cooldownRemaining(a) - breaker.cooldownRemaining(b));
  return [...ready, ...cooling];
}

/**
 * Run a completion, walking the tier's fallback chain.
 *
 * Each client already retries transient faults against its own model. This
 * layer handles the other failure: the model itself is unusable — rate
 * limited, retired, or returning nothing — and the work should move to a
 * different one rather than fail.
 */
export async function run(options: RunOptions): Promise<string> {
  const { tier, ledger, model: pinned, onFallback, ...rest } = options;
  const label = options.label ?? tier;
  const chain = pinned ? [pinned] : orderByAvailability(chainFor(tier));

  const errors: string[] = [];

  for (let i = 0; i < chain.length; i++) {
    const model = chain[i];
    const provider = providerFor(model, tier);
    const completeFn = provider === 'gemini' ? completeGemini : complete;

    // Everything is cooling down. Wait out the shortest cooldown once rather
    // than immediately burning the request on a model we know will 429.
    const cooldown = breaker.cooldownRemaining(model);
    if (cooldown > 0 && i === 0) {
      const wait = Math.min(cooldown, 8_000);
      logger.warn({ model, label, wait }, 'ai.chain.waiting-out-cooldown');
      await sleep(wait);
    }

    try {
      const result = await completeFn({ ...rest, model, label: i === 0 ? label : `${label}:fallback${i}` });
      breaker.recordSuccess(model);
      ledger?.add(label, result.usage);

      if (i > 0) {
        logger.warn({ label, primary: chain[0], used: model }, 'ai.chain.fallback-succeeded');
        onFallback?.({ from: chain[0], to: model, reason: errors[errors.length - 1] ?? 'unavailable' });
      }
      return result.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // A caller-initiated abort is not a model failure — do not penalise the
      // model and do not try the next one.
      if ((error as Error)?.name === 'AbortError') throw error;

      breaker.recordFailure(model, error);
      errors.push(`${model}: ${message.slice(0, 160)}`);

      const remaining = chain.length - i - 1;
      logger.warn(
        {
          label,
          model,
          remaining,
          status: error instanceof ProviderError ? error.status : undefined,
        },
        remaining > 0 ? 'ai.chain.falling-back' : 'ai.chain.exhausted',
      );
    }
  }

  throw new Error(
    `Every model for the ${tier} tier failed. Tried ${chain.length}: ${errors.join(' | ')}`,
  );
}

/**
 * Streaming variant.
 *
 * Falls back only on a failure to *open* the stream. Once tokens have reached
 * the learner, switching models mid-reply would splice two different voices
 * into one answer, so a mid-stream failure is surfaced instead.
 */
export function runStream(options: RunOptions): AsyncGenerator<string, Usage, void> {
  const { tier, ledger, model: pinned, onFallback, ...rest } = options;
  const label = options.label ?? tier;
  const chain = pinned ? [pinned] : orderByAvailability(chainFor(tier));

  async function* generate(): AsyncGenerator<string, Usage, void> {
    const errors: string[] = [];

    for (let i = 0; i < chain.length; i++) {
      const model = chain[i];
      const provider = providerFor(model, tier);
      const streamFn = provider === 'gemini' ? streamGemini : stream;

      const iterator = streamFn({ ...rest, model, label: i === 0 ? label : `${label}:fallback${i}` });

      let opened = false;
      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            breaker.recordSuccess(model);
            return next.value;
          }
          opened = true;
          yield next.value;
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error;

        breaker.recordFailure(model, error);
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${model}: ${message.slice(0, 160)}`);

        // Already streaming: the learner is reading a partial answer. Restarting
        // on another model would repeat and contradict it.
        if (opened) throw error;

        logger.warn({ label, model, remaining: chain.length - i - 1 }, 'ai.stream.falling-back');
        if (i < chain.length - 1) onFallback?.({ from: chain[0], to: chain[i + 1], reason: message });
      }
    }

    throw new Error(`Every model for the ${tier} tier failed to stream: ${errors.join(' | ')}`);
  }

  return generate();
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
    logger.warn(
      { label: options.label, error: (error as Error).message },
      'JSON parse failed, attempting repair pass',
    );

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

/** Current breaker state, for /api/health. */
export const modelHealth = () => breaker.snapshot();

export type { Message, Usage };
export { ProviderError } from './provider-error';
