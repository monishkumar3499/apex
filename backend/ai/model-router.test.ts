import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { modelFor, chainFor, providerFor, TokenLedger, runJson } from './model-router';
import { breaker, ProviderGate, gateFor } from './resilience';
import { ProviderError, parseRetryAfter, backoffMs, RETRYABLE_STATUS } from './provider-error';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnv() {
  const envPath = resolve(__dirname, '../../frontend/.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) {
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    }
  }
}

const TIER_ENV = ['NANO_MODEL', 'STRUCTURED_MODEL', 'PLANNING_MODEL', 'CHAT_MODEL', 'QUERY_MODEL'];

describe('tier & provider resolution', () => {
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = Object.fromEntries(TIER_ENV.map((k) => [k, process.env[k]]));
    TIER_ENV.forEach((k) => delete process.env[k]);
  });

  afterEach(() => {
    TIER_ENV.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    });
  });

  it('resolves the documented primary model for each tier', () => {
    expect(modelFor('nano')).toBe('minimax/minimax-m3:free');
    expect(modelFor('structured')).toBe('gemini-2.5-flash');
    expect(modelFor('chat')).toBe('minimax/minimax-m3:free');
  });

  it('gives every tier a multi-model fallback chain', () => {
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      expect(chainFor(tier).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('crosses providers within every chain, so one vendor outage is survivable', () => {
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      const providers = new Set(chainFor(tier).map((m) => providerFor(m, tier)));
      expect(providers.size).toBeGreaterThan(1);
    }
  });

  it('never repeats a model inside a chain, so retry budget is not wasted twice', () => {
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      const chain = chainFor(tier);
      expect(new Set(chain).size).toBe(chain.length);
    }
  });

  it('promotes a single env override to the head without discarding the fallbacks', () => {
    process.env.STRUCTURED_MODEL = 'gemini-2.5-flash-lite';
    const chain = chainFor('structured');
    expect(chain[0]).toBe('gemini-2.5-flash-lite');
    expect(chain.length).toBeGreaterThan(1);
    expect(new Set(chain).size).toBe(chain.length);
  });

  it('accepts a comma-separated chain override', () => {
    process.env.CHAT_MODEL = 'gemini-2.5-flash, minimax/minimax-m2.7:free';
    const chain = chainFor('chat');
    expect(chain[0]).toBe('gemini-2.5-flash');
    expect(chain[1]).toBe('minimax/minimax-m2.7:free');
  });

  it('strips quotes an .env file leaves behind', () => {
    process.env.NANO_MODEL = '"gemini-2.5-flash-lite"';
    expect(modelFor('nano')).toBe('gemini-2.5-flash-lite');
  });

  it('maps models and tiers to providers', () => {
    expect(providerFor('gemini-2.5-flash', 'structured')).toBe('gemini');
    expect(providerFor('gemini-2.5-flash-lite', 'nano')).toBe('gemini');
    expect(providerFor('models/gemini-2.5-pro', 'structured')).toBe('gemini');
    expect(providerFor('minimax/minimax-m3:free', 'nano')).toBe('openrouter');
    expect(providerFor('minimax/minimax-m3:free', 'chat')).toBe('openrouter');
    expect(providerFor('z-ai/glm-5.2:free', 'chat')).toBe('openrouter');
  });
});

describe('TokenLedger', () => {
  it('accumulates usage across a build', () => {
    const ledger = new TokenLedger();
    ledger.add('classify', { promptTokens: 100, completionTokens: 50, totalTokens: 150 });
    ledger.add('blueprint', { promptTokens: 1000, completionTokens: 1500, totalTokens: 2500 });

    expect(ledger.total.promptTokens).toBe(1100);
    expect(ledger.total.completionTokens).toBe(1550);
    expect(ledger.total.totalTokens).toBe(2650);
    expect(ledger.breakdown).toHaveLength(2);
    expect(ledger.breakdown[0].label).toBe('classify');
  });

  it('reports zero rather than NaN before anything ran', () => {
    expect(new TokenLedger().total.totalTokens).toBe(0);
  });
});

describe('ProviderError classification', () => {
  const make = (status: number) =>
    new ProviderError(`test ${status}`, {
      provider: 'openrouter',
      model: 'x/y:free',
      status,
      retryable: RETRYABLE_STATUS.has(status),
      fatalForModel: [400, 401, 403, 404, 413, 422].includes(status),
    });

  it('treats 429 as retryable and not fatal — the model is fine, just busy', () => {
    const error = make(429);
    expect(error.rateLimited).toBe(true);
    expect(error.retryable).toBe(true);
    expect(error.fatalForModel).toBe(false);
  });

  it('treats a retired slug as fatal for that model, so the chain moves on', () => {
    const error = make(404);
    expect(error.fatalForModel).toBe(true);
    expect(error.retryable).toBe(false);
  });

  it('treats 5xx as retryable', () => {
    expect(make(502).retryable).toBe(true);
    expect(make(503).retryable).toBe(true);
  });
});

describe('parseRetryAfter', () => {
  it('reads a seconds value', () => {
    expect(parseRetryAfter('12')).toBe(12_000);
  });

  it('reads an HTTP date', () => {
    const future = new Date(Date.now() + 20_000).toUTCString();
    const ms = parseRetryAfter(future)!;
    expect(ms).toBeGreaterThan(10_000);
    expect(ms).toBeLessThanOrEqual(30_000);
  });

  it('caps an absurd value so a build cannot sit on it', () => {
    expect(parseRetryAfter('86400', 60_000)).toBe(60_000);
  });

  it('returns undefined for a missing or unparseable header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
  });
});

describe('backoffMs', () => {
  it('grows with the attempt number', () => {
    const early = Array.from({ length: 40 }, () => backoffMs(0, 1_000));
    const later = Array.from({ length: 40 }, () => backoffMs(3, 1_000));
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(later)).toBeGreaterThan(mean(early));
  });

  it('respects the cap', () => {
    for (let i = 0; i < 50; i++) expect(backoffMs(20, 1_000, 30_000)).toBeLessThanOrEqual(30_000);
  });

  it('jitters, so concurrent callers do not retry in lockstep', () => {
    const values = new Set(Array.from({ length: 30 }, () => backoffMs(2, 1_000)));
    expect(values.size).toBeGreaterThan(5);
  });
});

describe('ModelBreaker', () => {
  beforeEach(() => breaker.reset());
  afterEach(() => breaker.reset());

  it('starts with every model available', () => {
    expect(breaker.available('gemini-2.5-flash')).toBe(true);
    expect(breaker.cooldownRemaining('gemini-2.5-flash')).toBe(0);
  });

  it('sidelines a rate-limited model for as long as the upstream asked', () => {
    const error = new ProviderError('429', {
      provider: 'openrouter',
      model: 'a/b:free',
      status: 429,
      retryAfterMs: 5_000,
      retryable: true,
      fatalForModel: false,
    });
    breaker.recordFailure('a/b:free', error);

    expect(breaker.available('a/b:free')).toBe(false);
    expect(breaker.cooldownRemaining('a/b:free')).toBeGreaterThan(3_000);
    expect(breaker.cooldownRemaining('a/b:free')).toBeLessThanOrEqual(5_000);
  });

  it('parks a retired slug for far longer than a rate limit', () => {
    const gone = new ProviderError('404', {
      provider: 'openrouter',
      model: 'dead/model:free',
      status: 404,
      retryable: false,
      fatalForModel: true,
    });
    breaker.recordFailure('dead/model:free', gone);
    expect(breaker.cooldownRemaining('dead/model:free')).toBeGreaterThan(60_000);
  });

  it('escalates the cooldown on repeated failures', () => {
    const generic = new Error('socket hang up');
    breaker.recordFailure('flaky', generic);
    const first = breaker.cooldownRemaining('flaky');
    breaker.recordFailure('flaky', generic);
    breaker.recordFailure('flaky', generic);
    expect(breaker.cooldownRemaining('flaky')).toBeGreaterThan(first);
  });

  it('clears the record entirely on one clean call', () => {
    breaker.recordFailure('recovering', new Error('boom'));
    expect(breaker.available('recovering')).toBe(false);
    breaker.recordSuccess('recovering');
    expect(breaker.available('recovering')).toBe(true);
    expect(breaker.snapshot()).toHaveLength(0);
  });

  it('reports what is cooling down, for /api/health', () => {
    breaker.recordFailure('a', new Error('x'));
    const snapshot = breaker.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0].model).toBe('a');
    expect(snapshot[0].failures).toBe(1);
  });
});

describe('ProviderGate', () => {
  it('never exceeds its concurrency limit', async () => {
    const gate = new ProviderGate('test', { concurrency: 2, minIntervalMs: 0 });
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 10 }, () =>
        gate.run(async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 10));
          active--;
        }),
      ),
    );

    expect(peak).toBeLessThanOrEqual(2);
  });

  it('spaces out request starts, which is what actually avoids a 429 burst', async () => {
    const gate = new ProviderGate('test', { concurrency: 4, minIntervalMs: 25 });
    const starts: number[] = [];

    await Promise.all(
      Array.from({ length: 4 }, () =>
        gate.run(async () => {
          starts.push(Date.now());
        }),
      ),
    );

    starts.sort((a, b) => a - b);
    const span = starts[starts.length - 1] - starts[0];
    // Three gaps of >=25ms between four starts.
    expect(span).toBeGreaterThanOrEqual(60);
  });

  it('releases its slot even when the task throws', async () => {
    const gate = new ProviderGate('test', { concurrency: 1, minIntervalMs: 0 });
    await expect(gate.run(async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    // A leaked slot would hang here forever.
    await expect(gate.run(async () => 'ok')).resolves.toBe('ok');
  });

  it('exposes a shared gate per provider, so all call sites throttle together', () => {
    expect(gateFor('gemini')).toBe(gateFor('gemini'));
    expect(gateFor('gemini')).not.toBe(gateFor('openrouter'));
  });
});

describe('live structured JSON call', () => {
  it(
    'produces parsed JSON through the Gemini structured tier',
    async () => {
      loadEnv();
      if (!process.env.GEMINI_API_KEY) return;

      const ledger = new TokenLedger();
      const result = await runJson<{ status: string; count: number }>({
        tier: 'structured',
        label: 'test:gemini',
        temperature: 0.1,
        ledger,
        messages: [
          { role: 'system', content: 'You are a concise JSON generator.' },
          { role: 'user', content: 'Output JSON: { "status": "ok", "count": 42 }' },
        ],
      });

      expect(result.status).toBe('ok');
      expect(result.count).toBe(42);
      expect(ledger.total.totalTokens).toBeGreaterThan(0);
    },
    { timeout: 45_000 },
  );
});
