/**
 * The provider registry.
 *
 * Kairo runs entirely on free upstream tiers, and the single hard fact about
 * free tiers is that **quota is per key, per vendor**. No amount of retrying
 * makes one exhausted bucket bigger. The only real defence is to hold several
 * independent buckets and move work between them, which is what this file
 * exists to declare.
 *
 * Eight vendors, each with its own quota, its own outage schedule and its own
 * definition of "too many requests". Seven of them speak the OpenAI chat
 * completions dialect, so they cost one config entry each rather than one
 * client each — see `oai.ts`. Gemini speaks its own, so it keeps `gemini.ts`.
 *
 * Every provider is optional. A missing key removes that provider's models
 * from every fallback chain rather than turning them into failed attempts, so
 * running with only `GEMINI_API_KEY` set behaves exactly as it did before this
 * file existed — just with fewer buckets to draw from.
 */

export type ProviderId =
  | 'gemini'
  | 'groq'
  | 'cerebras'
  | 'openrouter'
  | 'mistral'
  | 'cloudflare'
  | 'together'
  | 'github';

export interface ProviderSpec {
  id: ProviderId;
  /** Human name, for /api/health and logs. */
  label: string;
  /**
   * Which client speaks to it. `oai` covers every OpenAI-compatible endpoint;
   * `gemini` is Google's own `generateContent` shape.
   */
  dialect: 'oai' | 'gemini';
  /**
   * Env var holding the key. A **comma-separated list is accepted** and each
   * entry becomes an independently rate-limited identity — see `keyring.ts`.
   * Two free keys are two free quotas.
   */
  keyEnv: string;
  /** Chat-completions URL. `cloudflare` interpolates its account id. */
  endpoint: (() => string) | string;
  /**
   * Published free-tier request budget, used to size the token bucket.
   *
   * These are starting estimates, not gospel: the bucket re-learns the real
   * ceiling from the 429s and `Retry-After` headers the upstream actually
   * sends, so an optimistic number here self-corrects within a minute.
   */
  rpm: number;
  /** Requests per day, where the vendor caps that separately. */
  rpd?: number;
  /** How many of this provider's requests may be in flight at once. */
  concurrency: number;
  /**
   * Whether `response_format: { type: 'json_object' }` is honoured. Providers
   * that reject it get the schema in the prompt instead of a 400.
   */
  jsonMode: boolean;
  /** Extra headers beyond auth (OpenRouter wants attribution). */
  headers?: () => Record<string, string>;
  /** Shown in /api/health when the key is absent. */
  signup: string;
  /** Notes that matter when choosing between them. */
  note?: string;
}

const env = (name: string): string | undefined => {
  const raw = process.env[name]?.replace(/^["']|["']$/g, '').trim();
  return raw || undefined;
};

/**
 * Ordered by how much free throughput each one actually gives you.
 *
 * Groq and Cerebras lead because their free tiers are measured in thousands of
 * requests per day and single-digit-hundred-millisecond first tokens. An
 * OpenRouter `:free` slug, by contrast, is capped at 50 requests/day on an
 * account holding under 10 credits — which is a fifth of what one learner
 * needs, let alone twenty. OpenRouter stays in the chains as breadth, not as a
 * primary.
 */
export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  groq: {
    id: 'groq',
    label: 'Groq',
    dialect: 'oai',
    keyEnv: 'GROQ_API_KEY',
    endpoint: 'https://api.groq.com/openai/v1/chat/completions',
    // 30 RPM per model on the free tier, and the daily budget is per model too,
    // so a chain that spreads across three Groq slugs gets three allowances.
    rpm: 28,
    rpd: 13_000,
    concurrency: 6,
    jsonMode: true,
    signup: 'https://console.groq.com/keys',
    note: 'Fastest free inference available; the coach reaches first token in ~200ms.',
  },

  cerebras: {
    id: 'cerebras',
    label: 'Cerebras',
    dialect: 'oai',
    keyEnv: 'CEREBRAS_API_KEY',
    endpoint: 'https://api.cerebras.ai/v1/chat/completions',
    rpm: 28,
    rpd: 13_000,
    concurrency: 6,
    jsonMode: true,
    signup: 'https://cloud.cerebras.ai/platform/apikeys',
    note: 'Comparable limits to Groq on entirely separate hardware and quota.',
  },

  gemini: {
    id: 'gemini',
    label: 'Google Gemini',
    dialect: 'gemini',
    keyEnv: 'GEMINI_API_KEY',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta',
    // Free `gemini-2.5-flash` is ~10 RPM / 250 RPD. Low, but it remains the
    // most dependable JSON producer in the set, so it stays the structured
    // primary and the volume tiers are routed away from it.
    rpm: 9,
    rpd: 240,
    concurrency: 4,
    jsonMode: true,
    signup: 'https://aistudio.google.com/apikey',
    note: 'Best structured-JSON reliability; tightest free request budget.',
  },

  mistral: {
    id: 'mistral',
    label: 'Mistral',
    dialect: 'oai',
    keyEnv: 'MISTRAL_API_KEY',
    endpoint: 'https://api.mistral.ai/v1/chat/completions',
    // The free "Experiment" plan is ~1 request/second with a generous
    // per-minute token allowance.
    rpm: 55,
    concurrency: 3,
    jsonMode: true,
    signup: 'https://console.mistral.ai/api-keys',
    note: 'High request ceiling; needs phone verification to activate.',
  },

  github: {
    id: 'github',
    label: 'GitHub Models',
    dialect: 'oai',
    keyEnv: 'GITHUB_MODELS_TOKEN',
    endpoint: 'https://models.github.ai/inference/chat/completions',
    // Free with any GitHub PAT carrying the `models:read` scope. Modest
    // per-minute limit, but it is an entirely separate bucket from everything
    // else here, which is the whole point of listing it.
    rpm: 14,
    rpd: 140,
    concurrency: 2,
    jsonMode: true,
    signup: 'https://github.com/settings/personal-access-tokens (scope: models:read)',
    note: 'Free with a GitHub PAT — no billing relationship required at all.',
  },

  cloudflare: {
    id: 'cloudflare',
    label: 'Cloudflare Workers AI',
    dialect: 'oai',
    keyEnv: 'CLOUDFLARE_API_TOKEN',
    endpoint: () =>
      `https://api.cloudflare.com/client/v4/accounts/${env('CLOUDFLARE_ACCOUNT_ID') ?? ''}/ai/v1/chat/completions`,
    // Free allowance is 10,000 "neurons" per day rather than a request count;
    // small chat calls are cheap in neurons, so this is a real daily bucket.
    rpm: 25,
    concurrency: 4,
    jsonMode: false,
    signup: 'https://dash.cloudflare.com/profile/api-tokens (Workers AI: Read)',
    note: 'Needs CLOUDFLARE_ACCOUNT_ID as well as the token.',
  },

  together: {
    id: 'together',
    label: 'Together AI',
    dialect: 'oai',
    keyEnv: 'TOGETHER_API_KEY',
    endpoint: 'https://api.together.xyz/v1/chat/completions',
    rpm: 55,
    concurrency: 3,
    jsonMode: true,
    signup: 'https://api.together.ai/settings/api-keys',
    note: 'Only the explicitly "-Free" slugs cost nothing.',
  },

  openrouter: {
    id: 'openrouter',
    label: 'OpenRouter',
    dialect: 'oai',
    keyEnv: 'OPENROUTER_API_KEY',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    // `:free` slugs are 20 RPM but only **50 requests/day** on an account with
    // fewer than 10 lifetime credits (1,000/day above that). Kept last in every
    // chain for exactly that reason.
    rpm: 18,
    rpd: 50,
    concurrency: 2,
    jsonMode: true,
    headers: () => ({
      'HTTP-Referer': env('SITE_URL') ?? 'http://localhost:3000',
      'X-Title': env('SITE_NAME') ?? 'Kairo',
    }),
    signup: 'https://openrouter.ai/keys',
    note: 'Free slugs are capped at 50 requests/day under 10 credits — breadth, not a primary.',
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];

export const providerEndpoint = (id: ProviderId): string => {
  const { endpoint } = PROVIDERS[id];
  return typeof endpoint === 'function' ? endpoint() : endpoint;
};

/**
 * Raw keys for a provider, in declaration order.
 *
 * Splitting on commas is what makes multi-key rotation a config change rather
 * than a code change: `GROQ_API_KEY="gsk_a,gsk_b,gsk_c"` triples the free
 * quota, because the upstream meters per key and has no idea the three belong
 * to one deployment.
 */
export function keysFor(id: ProviderId): string[] {
  const spec = PROVIDERS[id];
  const raw = env(spec.keyEnv);
  if (!raw) return [];

  return [
    ...new Set(
      raw
        .split(',')
        .map((key) => key.replace(/^["']|["']$/g, '').trim())
        .filter(Boolean),
    ),
  ];
}

/** Cloudflare is the one provider that needs a second value to be usable. */
export function isConfigured(id: ProviderId): boolean {
  if (keysFor(id).length === 0) return false;
  if (id === 'cloudflare') return Boolean(env('CLOUDFLARE_ACCOUNT_ID'));
  return true;
}

export const configuredProviders = (): ProviderId[] => PROVIDER_IDS.filter(isConfigured);

/**
 * Model → provider.
 *
 * Three resolution routes, most explicit first:
 *
 *   1. An explicit `provider:model` prefix (`groq:llama-3.3-70b-versatile`).
 *      Unambiguous, and the only way to express that two vendors serve the
 *      same slug — which they routinely do, since half of these providers host
 *      the same Llama weights.
 *   2. This table, for the bare slugs used in the built-in chains.
 *   3. Shape heuristics, so slugs written before this registry existed
 *      (`gemini-2.5-flash`, `minimax/minimax-m3:free`) keep resolving.
 */
const MODEL_PROVIDER: Record<string, ProviderId> = {
  // Groq
  'llama-3.3-70b-versatile': 'groq',
  'llama-3.1-8b-instant': 'groq',
  'openai/gpt-oss-120b': 'groq',
  'openai/gpt-oss-20b': 'groq',
  'qwen/qwen3-32b': 'groq',
  'moonshotai/kimi-k2-instruct': 'groq',
  'gemma2-9b-it': 'groq',

  // Cerebras
  'llama-3.3-70b': 'cerebras',
  'llama3.1-8b': 'cerebras',
  'qwen-3-32b': 'cerebras',
  'gpt-oss-120b': 'cerebras',

  // Mistral
  'mistral-small-latest': 'mistral',
  'ministral-8b-latest': 'mistral',
  'open-mistral-nemo': 'mistral',

  // GitHub Models
  'openai/gpt-4o-mini': 'github',
  'openai/gpt-4.1-mini': 'github',
  'meta/Llama-3.3-70B-Instruct': 'github',
};

/**
 * Split an optionally prefixed slug into its provider and the slug the
 * upstream itself expects.
 *
 * The prefix has to be stripped before the request goes out: Groq has never
 * heard of a model called `groq:llama-3.3-70b-versatile`.
 */
export function resolveModel(
  ref: string,
  hint?: ProviderId,
): { provider: ProviderId; model: string } {
  const trimmed = ref.replace(/^["']|["']$/g, '').trim();

  const colon = trimmed.indexOf(':');
  if (colon > 0) {
    const candidate = trimmed.slice(0, colon) as ProviderId;
    if (candidate in PROVIDERS) {
      return { provider: candidate, model: trimmed.slice(colon + 1) };
    }
  }

  const known = MODEL_PROVIDER[trimmed];
  if (known) return { provider: known, model: trimmed };

  const lower = trimmed.toLowerCase();
  if (lower.includes('gemini') || lower.startsWith('models/')) {
    return { provider: 'gemini', model: trimmed };
  }
  // A vendor-prefixed slug with no registry entry is an OpenRouter route:
  // that is the only provider here whose slugs are all `vendor/model`.
  if (trimmed.includes('/')) return { provider: 'openrouter', model: trimmed };

  // A bare, unrecognised slug. The caller's tier hint is the best remaining
  // signal; structured work has always meant Gemini in this codebase.
  return { provider: hint ?? 'gemini', model: trimmed };
}
