import { NextResponse } from 'next/server';
import { modelFor, type Tier } from '../../../../backend/ai/model-router';

export const runtime = 'nodejs';

const TIERS: Tier[] = ['nano', 'structured', 'chat'];

/**
 * Confirm a configured model slug still resolves.
 *
 * Presence of an API key says nothing about whether the models are usable:
 * OpenRouter retires slugs (`openai/gpt-oss-120b:free` now 404s), and a
 * retired nano model shows up as a silently degraded plan rather than an
 * error. A 1-token completion is the cheapest way to tell them apart.
 *
 * A 429 means the slug is valid but the free tier is busy — that is degraded,
 * not misconfigured, so it is reported separately from a dead slug.
 */
async function probe(model: string): Promise<{ model: string; ok: boolean; status: number; note?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'HTTP-Referer': process.env.SITE_URL || 'http://localhost:3000',
        'X-Title': process.env.SITE_NAME || 'APEX',
      },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: controller.signal,
    });

    if (response.ok) return { model, ok: true, status: response.status };

    const detail = await response.text().catch(() => '');
    return {
      model,
      // Rate limiting proves the slug exists; it is a capacity problem.
      ok: response.status === 429,
      status: response.status,
      note: response.status === 429 ? 'rate-limited upstream' : detail.slice(0, 160),
    };
  } catch (error) {
    return { model, ok: false, status: 0, note: (error as Error).message.slice(0, 160) };
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
  ];
  const optional = ['TAVILY_API_KEY', 'YOUTUBE_API_KEY'];

  const missing = required.filter((key) => !process.env[key]);
  const degraded = optional.filter((key) => !process.env[key]);

  // Costs three upstream calls, so it is opt-in: /api/health?models=1.
  const checkModels = new URL(request.url).searchParams.has('models');
  let models: Array<{ tier: Tier; model: string; ok: boolean; status: number; note?: string }> = [];
  let badModels: typeof models = [];

  if (checkModels && !missing.includes('OPENROUTER_API_KEY')) {
    const results = await Promise.all(
      TIERS.map(async (tier) => ({ tier, ...(await probe(modelFor(tier))) })),
    );
    models = results;
    badModels = results.filter((r) => !r.ok);
  }

  const broken = missing.length > 0 || badModels.length > 0;

  return NextResponse.json(
    {
      ok: !broken,
      status: broken ? 'misconfigured' : degraded.length ? 'degraded' : 'healthy',
      missing,
      // Without these the plan still builds, but with far weaker resources.
      degraded,
      ...(checkModels ? { models } : {}),
      time: new Date().toISOString(),
    },
    { status: broken ? 503 : 200 },
  );
}
