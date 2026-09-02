import { NextResponse } from 'next/server';
import { modelFor, providerFor, type Tier } from '../../../../backend/ai/model-router';
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

/**
 * Confirm a configured model slug still resolves.
 *
 * Checks OpenRouter or Google Gemini according to the model slug / tier provider.
 */
async function probe(
  tier: Tier,
  model: string,
): Promise<{ tier: Tier; model: string; provider: string; ok: boolean; status: number; note?: string }> {
  const provider = providerFor(model, tier);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return { tier, model, provider, ok: false, status: 0, note: 'GEMINI_API_KEY is missing' };

      const cleanModel = model.replace(/^models\//, '').trim();
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
          signal: controller.signal,
        },
      );

      if (response.ok) return { tier, model, provider, ok: true, status: response.status };

      const detail = await response.text().catch(() => '');
      return {
        tier,
        model,
        provider,
        ok: response.status === 429,
        status: response.status,
        note: response.status === 429 ? 'rate-limited upstream' : detail.slice(0, 160),
      };
    }

    // OpenRouter provider
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return { tier, model, provider, ok: false, status: 0, note: 'OPENROUTER_API_KEY is missing' };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': process.env.SITE_NAME || 'APEX',
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: controller.signal,
    });

    if (response.ok) return { tier, model, provider, ok: true, status: response.status };

    const detail = await response.text().catch(() => '');
    return {
      tier,
      model,
      provider,
      ok: response.status === 429,
      status: response.status,
      note: response.status === 429 ? 'rate-limited upstream' : detail.slice(0, 160),
    };
  } catch (error) {
    return { tier, model, provider, ok: false, status: 0, note: (error as Error).message.slice(0, 160) };
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
    'OPENROUTER_API_KEY',
    'GEMINI_API_KEY',
  ];
  const optional = ['TAVILY_API_KEY', 'YOUTUBE_API_KEY'];

  const missing = required.filter((key) => !process.env[key]);
  const degraded = optional.filter((key) => !process.env[key]);

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

  // Costs upstream calls, so it is opt-in: /api/health?models=1.
  const checkModels = new URL(request.url).searchParams.has('models');
  let models: Array<{ tier: Tier; model: string; provider: string; ok: boolean; status: number; note?: string }> = [];
  let badModels: typeof models = [];

  if (checkModels) {
    const results = await Promise.all(
      TIERS.map((tier) => probe(tier, modelFor(tier))),
    );
    models = results;
    badModels = results.filter((r) => !r.ok);
  }

  const broken = missing.length > 0 || badModels.length > 0 || authBroken;

  return NextResponse.json(
    {
      ok: !broken,
      status: broken ? 'misconfigured' : degraded.length ? 'degraded' : 'healthy',
      missing,
      // Without these the plan still builds, but with far weaker resources.
      degraded,
      auth,
      ...(checkModels ? { models } : {}),
      time: new Date().toISOString(),
    },
    { status: broken ? 503 : 200 },
  );
}
