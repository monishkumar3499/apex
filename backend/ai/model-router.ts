import { completeOai, streamOai, ProviderUnavailable } from './oai';
import { completeGemini, streamGemini } from './gemini';
import { parseModelJson, JsonParseError } from './json';
import { ProviderError } from './provider-error';
import { breaker, sleep, gateSnapshot } from './resilience';
import { keyring, keyringSnapshot, providerWaitMs } from './keyring';
import {
  PROVIDERS,
  configuredProviders,
  isConfigured,
  resolveModel,
  type ProviderId,
} from './providers';
import type { CompletionOptions, Message, Usage } from './types';
import { logger } from '../logger/pino';

/**
 * Model tiers.
 *
 * Routing by *job size* rather than by agent name is what keeps the bill down:
 * classification is a 200-token job and must never hit the same model as the
 * 1500-token structure generation.
 */
export type Tier = 'nano' | 'structured' | 'chat';
export type Provider = ProviderId;

/**
 * Fallback chains, in preference order.
 *
 * The chains are long and deliberately vendor-diverse, because on free tiers
 * **breadth is the only real capacity**. Quota is metered per key per vendor,
 * so the way to serve twenty learners is to hold eight independent buckets and
 * move between them — not to retry one bucket more politely.
 *
 * A slug may carry an explicit `provider:` prefix. Half of these vendors serve
 * the same Llama weights, and the prefix is the only way to say *which* copy of
 * `llama-3.3-70b` a chain entry means.
 *
 *   nano       classification + JSON repair  → Groq / Cerebras: highest free
 *                                              request budgets, sub-second
 *   structured blueprints + drills           → Gemini first for JSON fidelity,
 *                                              then 70B-class models elsewhere
 *   chat       the coach                     → Groq first: ~200ms to first
 *                                              token, against 3–13s on an
 *                                              OpenRouter free slug
 *
 * Ordering principle: **cheapest-to-refill bucket first.** Groq and Cerebras
 * allow roughly 13,000 requests/day each; free `gemini-2.5-flash` allows about
 * 250; an OpenRouter `:free` slug allows 50 on an account under 10 credits.
 * That last number is why OpenRouter, which used to lead two of these three
 * chains, is now last in all of them — 50/day is a fifth of what one learner
 * needs, never mind twenty.
 *
 * Unconfigured providers are filtered out at call time rather than listed
 * conditionally, so this table stays a readable statement of preference and a
 * deployment with one key behaves exactly as it always did.
 */
const CHAINS: Record<Tier, string[]> = {
  nano: [
    'groq:llama-3.1-8b-instant',
    'cerebras:llama3.1-8b',
    'gemini-2.5-flash-lite',
    'groq:gemma2-9b-it',
    'mistral:ministral-8b-latest',
    'github:openai/gpt-4o-mini',
    'cloudflare:@cf/meta/llama-3.1-8b-instruct-fast',
    'minimax/minimax-m3:free',
  ],
  structured: [
    'gemini-2.5-flash',
    'groq:llama-3.3-70b-versatile',
    'cerebras:llama-3.3-70b',
    'groq:openai/gpt-oss-120b',
    'gemini-2.5-flash-lite',
    'mistral:mistral-small-latest',
    'cerebras:qwen-3-32b',
    'github:openai/gpt-4.1-mini',
    'cloudflare:@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    'minimax/minimax-m3:free',
  ],
  chat: [
    'groq:llama-3.3-70b-versatile',
    'cerebras:llama-3.3-70b',
    'gemini-2.5-flash',
    'groq:moonshotai/kimi-k2-instruct',
    'mistral:mistral-small-latest',
    'github:openai/gpt-4o-mini',
    'minimax/minimax-m3:free',
    'z-ai/glm-5.2:free',
  ],
};

const clean = (value?: string) => value?.replace(/^["']|["']$/g, '').trim();

/** The primary model for a tier — what the env var overrides. */
export function modelFor(tier: Tier): string {
  return chainFor(tier)[0];
}

/**
 * The full ordered chain for a tier, as declared.
 *
 * `NANO_MODEL` / `STRUCTURED_MODEL` / `CHAT_MODEL` accept a comma-separated
 * list, so an operator can reorder or extend a chain without a deploy. A single
 * value is promoted to the head of the built-in chain rather than replacing it:
 * overriding the primary model should not silently discard every fallback.
 *
 * This is the *declaration*, independent of which keys happen to be present —
 * `usableChain` is what actually gets called.
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

/**
 * The chain minus every model whose provider has no key.
 *
 * Listing a model we cannot authenticate against does not add resilience, it
 * subtracts it: each unusable entry is a guaranteed failed attempt that also
 * opens a breaker on a model that was never the problem.
 */
export function usableChain(tier: Tier): string[] {
  const chain = chainFor(tier).filter((ref) => isConfigured(resolveModel(ref, tierProvider(tier)).provider));

  if (chain.length === 0) {
    const declared = chainFor(tier).length;
    throw new Error(
      `No AI provider is configured for the ${tier} tier. ` +
        `All ${declared} candidate models belong to providers with no API key. ` +
        `Set at least one of: ${[...new Set(Object.values(PROVIDERS).map((p) => p.keyEnv))].join(', ')}.`,
    );
  }
  return chain;
}

/**
 * Where a bare, unrecognised slug should be assumed to live.
 *
 * Preserves the rule this codebase has always used: an unprefixed slug on the
 * structured tier is a Google model name, anything else unprefixed is an
 * OpenRouter route. Only reached for slugs absent from the registry — i.e. an
 * operator's env override for a model added after this code was written.
 */
const tierProvider = (tier: Tier): ProviderId => (tier === 'structured' ? 'gemini' : 'openrouter');

/**
 * Which provider serves this model reference.
 *
 * Kept as a named export because `/api/health` and the tests both reason about
 * routing without making a call.
 */
export function providerFor(model: string, tier?: Tier): ProviderId {
  return resolveModel(model, tier ? tierProvider(tier) : undefined).provider;
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
 * Two independent signals decide this, and conflating them was the flaw in the
 * previous version:
 *
 *   • the **model's** breaker — this slug is retired, or just failed
 *   • the **provider's** keyring — this vendor has no rate-limit headroom
 *
 * A perfectly healthy model on a saturated vendor should lose its place to a
 * slightly less preferred model on an idle one. Sorting by the sum of both
 * waits expresses exactly that, and keeps the declared preference order as the
 * tie-break when everything is free.
 *
 * Nothing is ever dropped. If every provider is cooling down, the least-cooled
 * option is still a better answer than failing the build outright.
 */
function orderByAvailability(chain: string[], tier: Tier): string[] {
  const scored = chain.map((ref, index) => {
    const { provider } = resolveModel(ref, tierProvider(tier));
    const modelWait = breaker.cooldownRemaining(ref);
    const providerWait = providerWaitMs(provider);

    return {
      ref,
      index,
      // Infinity would poison the arithmetic; an unconfigured provider is
      // already filtered out, so this only guards an empty keyring.
      wait: modelWait + (Number.isFinite(providerWait) ? providerWait : 600_000),
    };
  });

  // Sub-second differences are noise, not signal: bucketing to the second stops
  // a 40ms head start from overriding the deliberate preference ordering above.
  return scored
    .sort((a, b) => Math.floor(a.wait / 1000) - Math.floor(b.wait / 1000) || a.index - b.index)
    .map((entry) => entry.ref);
}

/**
 * Run a completion, walking the tier's fallback chain.
 *
 * Each client already retries transient faults against its own model. This
 * layer handles the other two failures: the model itself is unusable — retired,
 * or returning nothing — and the *provider* is out of headroom. They are
 * treated differently on purpose. A model failure opens that model's breaker; a
 * saturated provider does not, because the model did nothing wrong and
 * penalising it would remove it from the chain for the next learner too.
 */
export async function run(options: RunOptions): Promise<string> {
  const { tier, ledger, model: pinned, onFallback, ...rest } = options;
  const label = options.label ?? tier;
  const chain = pinned ? [pinned] : orderByAvailability(usableChain(tier), tier);

  const errors: string[] = [];
  let attempted = 0;

  for (let i = 0; i < chain.length; i++) {
    const ref = chain[i];
    const { provider, model } = resolveModel(ref, tierProvider(tier));

    // Everything is cooling down. Wait out the shortest cooldown once rather
    // than immediately burning the request on a model we know will 429.
    const cooldown = breaker.cooldownRemaining(ref);
    if (cooldown > 0 && i === 0) {
      const wait = Math.min(cooldown, 8_000);
      logger.warn({ model: ref, label, wait }, 'ai.chain.waiting-out-cooldown');
      await sleep(wait);
    }

    try {
      attempted++;
      const call = { ...rest, model, label: attempted === 1 ? label : `${label}:fallback${attempted - 1}` };
      const result =
        PROVIDERS[provider].dialect === 'gemini'
          ? await completeGemini(call)
          : await completeOai(provider, call);

      breaker.recordSuccess(ref);
      ledger?.add(label, result.usage);

      if (ref !== chain[0]) {
        logger.warn({ label, primary: chain[0], used: ref }, 'ai.chain.fallback-succeeded');
        onFallback?.({ from: chain[0], to: ref, reason: errors[errors.length - 1] ?? 'unavailable' });
      }
      return result.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // A caller-initiated abort is not a model failure — do not penalise the
      // model and do not try the next one.
      if ((error as Error)?.name === 'AbortError') throw error;

      if (error instanceof ProviderUnavailable) {
        // The vendor is rate limited, not the model. Skip to the next entry
        // without opening a breaker: this slug is still perfectly good, and on
        // a different vendor it is still the best remaining option.
        errors.push(`${ref}: ${provider} saturated`);
        logger.debug(
          { label, model: ref, provider, waitMs: error.waitMs },
          'ai.chain.provider-saturated',
        );
        // Not counted as an attempt — nothing was sent.
        attempted--;
        continue;
      }

      breaker.recordFailure(ref, error);
      errors.push(`${ref}: ${message.slice(0, 160)}`);

      const remaining = chain.length - i - 1;
      logger.warn(
        {
          label,
          model: ref,
          provider,
          remaining,
          status: error instanceof ProviderError ? error.status : undefined,
        },
        remaining > 0 ? 'ai.chain.falling-back' : 'ai.chain.exhausted',
      );
    }
  }

  // Every provider being saturated is a different situation from every model
  // being broken, and the operator needs to be able to tell them apart.
  if (attempted === 0) {
    throw new Error(
      `Every provider for the ${tier} tier is rate limited right now. ` +
        `Tried ${chain.length} models across ${new Set(chain.map((r) => resolveModel(r, tierProvider(tier)).provider)).size} providers. ` +
        `Add another key (any provider's env var accepts a comma-separated list) to widen the quota.`,
    );
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

  async function* generate(): AsyncGenerator<string, Usage, void> {
    const chain = pinned ? [pinned] : orderByAvailability(usableChain(tier), tier);
    const errors: string[] = [];

    for (let i = 0; i < chain.length; i++) {
      const ref = chain[i];
      const { provider, model } = resolveModel(ref, tierProvider(tier));
      const call = { ...rest, model, label: i === 0 ? label : `${label}:fallback${i}` };

      const iterator =
        PROVIDERS[provider].dialect === 'gemini' ? streamGemini(call) : streamOai(provider, call);

      let opened = false;
      try {
        while (true) {
          const next = await iterator.next();
          if (next.done) {
            breaker.recordSuccess(ref);
            return next.value;
          }
          opened = true;
          yield next.value;
        }
      } catch (error) {
        if ((error as Error)?.name === 'AbortError') throw error;

        // Already streaming: the learner is reading a partial answer. Restarting
        // on another model would repeat and contradict it.
        if (opened) throw error;

        const message = error instanceof Error ? error.message : String(error);
        errors.push(`${ref}: ${message.slice(0, 160)}`);

        // A saturated provider is not this model's fault — see `run`.
        if (!(error instanceof ProviderUnavailable)) breaker.recordFailure(ref, error);

        logger.warn({ label, model: ref, provider, remaining: chain.length - i - 1 }, 'ai.stream.falling-back');
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

/**
 * The full rate-limit picture: which providers are configured, how much
 * headroom each key has right now, and who is queued behind them.
 *
 * This is the view that answers "why is a build slow" in one request, which
 * previously took reading the logs.
 */
export function providerHealth() {
  const configured = configuredProviders();

  return {
    /** Independent quota buckets available — the real anti-rate-limit metric. */
    buckets: configured.reduce((sum, id) => sum + keyring(id).size, 0),
    providers: configured.map((id) => ({
      provider: id,
      label: PROVIDERS[id].label,
      keys: keyring(id).size,
      dialect: PROVIDERS[id].dialect,
      waitMs: Math.round(providerWaitMs(id)),
    })),
    missing: (Object.keys(PROVIDERS) as ProviderId[])
      .filter((id) => !isConfigured(id))
      .map((id) => ({
        provider: id,
        label: PROVIDERS[id].label,
        env: PROVIDERS[id].keyEnv,
        signup: PROVIDERS[id].signup,
        note: PROVIDERS[id].note,
      })),
    rateLimits: keyringSnapshot(),
    queues: gateSnapshot(),
    cooling: breaker.snapshot(),
  };
}

export type { Message, Usage };
export { ProviderError } from './provider-error';
export { PROVIDERS, configuredProviders, resolveModel } from './providers';
