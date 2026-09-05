import { NextResponse } from 'next/server';
import {
  modelFor,
  providerFor,
  usableChain,
  providerHealth,
  PROVIDERS,
  resolveModel,
  type Tier,
} from '../../../../backend/ai/model-router';
import { resolveOrigin } from '../../../lib/auth-url';

const clean = (val?: string) => val?.replace(/^["']|["']$/g, '').trim();

/**
 * Captured at module scope so the compiler inlines them exactly as it does for
 * the browser bundle. Reading process.env inside the handler would instead be
 * a runtime lookup, and would report `true` even when the client build got
 * nothing — which is the exact failure this is here to catch.
 */
const BUNDLED_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const BUNDLED_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const runtime = 'nodejs';

const TIERS: Tier[] = ['nano', 'structured', 'chat'];

interface Probe {
  tier?: Tier;
  model: string;
  provider: string;
  ok: boolean;
  status: number;
  ms?: number;
  note?: string;
}

/**
 * Confirm a configured model slug still resolves.
 *
 * Provider-agnostic: the registry knows every endpoint and auth shape, so a
 * new vendor becomes probeable without touching this file. Providers retire
 * slugs without notice, and a chain full of dead slugs turns one failure into
 * ten — so this is the check to run after any model change.
 */
async function probe(ref: string, tier?: Tier): Promise<Probe> {
  const { provider, model } = resolveModel(ref, tier === 'structured' ? 'gemini' : 'openrouter');
  const spec = PROVIDERS[provider];
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  const key = clean(process.env[spec.keyEnv])?.split(',')[0]?.trim();
  if (!key) {
    clearTimeout(timer);
    return { tier, model: ref, provider, ok: false, status: 0, note: `${spec.keyEnv} is missing` };
  }

  try {
    const endpoint =
      typeof spec.endpoint === 'function' ? spec.endpoint() : spec.endpoint;

    const response =
      spec.dialect === 'gemini'
        ? await fetch(
            `${endpoint}/models/${model.replace(/^models\//, '')}:generateContent?key=${key}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
                generationConfig: { maxOutputTokens: 1 },
              }),
              signal: controller.signal,
            },
          )
        : await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${key}`,
              ...(spec.headers?.() ?? {}),
            },
            body: JSON.stringify({
              model,
              messages: [{ role: 'user', content: 'ping' }],
              max_tokens: 1,
            }),
            signal: controller.signal,
          });

    const ms = Date.now() - started;
    if (response.ok) return { tier, model: ref, provider, ok: true, status: response.status, ms };

    const detail = await response.text().catch(() => '');
    return {
      tier,
      model: ref,
      provider,
      // A 429 means the slug is alive and the key is valid — it is the quota
      // that is busy. That is a working configuration, not a broken one.
      ok: response.status === 429,
      status: response.status,
      ms,
      note: response.status === 429 ? 'rate-limited upstream' : detail.slice(0, 160),
    };
  } catch (error) {
    return {
      tier,
      model: ref,
      provider,
      ok: false,
      status: 0,
      ms: Date.now() - started,
      note: (error as Error).message.slice(0, 160),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Liveness probe plus a config sanity check for deploys. */
export async function GET(request: Request) {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = required.filter((key) => !process.env[key]);

  const ai = providerHealth();

  // Any one provider is enough to run. Which one is a capacity question, not a
  // liveness one — and it is answered by `ai.buckets` below.
  if (ai.buckets === 0) {
    missing.push(`an AI provider key (any of: ${ai.missing.map((m) => m.env).join(', ')})`);
  }

  const optional = ['TAVILY_API_KEY', 'YOUTUBE_API_KEY'];
  const degraded = optional.filter((key) => !process.env[key]);

  /**
   * Independent quota buckets is *the* number to watch on free tiers.
   *
   * Every bucket is a separate rate limit, and 10–20 concurrent learners on
   * one bucket will hit 429s no matter how politely the pipeline paces itself.
   * Below three, say so plainly rather than reporting a green light that will
   * go red under load.
   */
  if (ai.buckets > 0 && ai.buckets < 3) {
    degraded.push(
      `only ${ai.buckets} AI quota bucket${ai.buckets === 1 ? '' : 's'} — ` +
        `add another provider key, or a second comma-separated key on an existing one`,
    );
  }

  // Auth config is the one thing a runtime env check cannot fully verify:
  // NEXT_PUBLIC_* are compiled into the browser bundle, so a server that reads
  // them correctly can still be serving a bundle that got `undefined`. Report
  // both sides so a broken sign-in is diagnosable from one request.
  const auth = {
    demoMode: clean(process.env.NEXT_PUBLIC_DEMO_MODE) === 'true',
    // Present on the server at runtime.
    serverSupabaseUrl: Boolean(clean(process.env.NEXT_PUBLIC_SUPABASE_URL)),
    // Baked into the client bundle at build time. False here means "Continue
    // with Google" cannot work, whatever --env-file says.
    bundledSupabaseUrl: Boolean(clean(BUNDLED_SUPABASE_URL)),
    bundledSupabaseAnonKey: Boolean(clean(BUNDLED_SUPABASE_ANON_KEY)),
    // Unset means OAuth redirects rely on x-forwarded-* headers, which is fine
    // locally and fragile behind a proxy that does not set them.
    appOrigin: clean(process.env.APP_ORIGIN) ?? null,
    callbackUrl: `${resolveOrigin(request)}/auth/callback`,
  };

  const authBroken = !auth.demoMode && (!auth.bundledSupabaseUrl || !auth.bundledSupabaseAnonKey);

  // Costs upstream calls, so it is opt-in:
  //   /api/health?models=1   probes each tier's primary
  //   /api/health?models=all probes every model in every usable chain
  const params = new URL(request.url).searchParams;
  const checkModels = params.has('models');
  const checkAll = params.get('models') === 'all';

  let models: Probe[] = [];
  let badModels: Probe[] = [];

  if (checkModels && ai.buckets > 0) {
    if (checkAll) {
      // Every distinct model across all three chains, probed once each. A slug
      // shared by two tiers is one upstream call, not two.
      const seen = new Map<string, Tier>();
      for (const tier of TIERS) {
        let chain: string[] = [];
        try {
          chain = usableChain(tier);
        } catch {
          chain = [];
        }
        for (const ref of chain) if (!seen.has(ref)) seen.set(ref, tier);
      }
      models = await Promise.all([...seen].map(([ref, tier]) => probe(ref, tier)));
    } else {
      models = await Promise.all(TIERS.map((tier) => probe(modelFor(tier), tier)));
    }
    badModels = models.filter((r) => !r.ok);
  }

  /**
   * A tier is broken only when *every* model in it is unreachable.
   *
   * With ten models across five vendors in a chain, one retired slug is not an
   * outage — reporting it as one would make a healthy deploy look failed. What
   * matters is whether a tier has anything left to call.
   */
  const brokenTiers = checkAll
    ? TIERS.filter((tier) => {
        const inTier = models.filter((m) => {
          try {
            return usableChain(tier).includes(m.model);
          } catch {
            return false;
          }
        });
        return inTier.length > 0 && inTier.every((m) => !m.ok);
      })
    : badModels.map((m) => m.tier!).filter(Boolean);

  const broken = missing.length > 0 || brokenTiers.length > 0 || authBroken;

  return NextResponse.json(
    {
      ok: !broken,
      status: broken ? 'misconfigured' : degraded.length ? 'degraded' : 'healthy',
      missing,
      // Without these the plan still builds, but with far weaker resources.
      degraded,
      auth,
      /**
       * The rate-limit picture in one place: how many independent quota
       * buckets exist, how much headroom each key has right now, which
       * learners are queued, and which models are cooling down.
       *
       * This is the view that answers "why is a build slow" without reading
       * the logs.
       */
      ai: {
        ...ai,
        tiers: TIERS.map((tier) => {
          try {
            const chain = usableChain(tier);
            return {
              tier,
              primary: chain[0],
              provider: providerFor(chain[0], tier),
              depth: chain.length,
              vendors: new Set(chain.map((ref) => providerFor(ref, tier))).size,
            };
          } catch (error) {
            return { tier, error: (error as Error).message };
          }
        }),
      },
      ...(checkModels ? { models, brokenTiers } : {}),
      time: new Date().toISOString(),
    },
    { status: broken ? 503 : 200 },
  );
}
