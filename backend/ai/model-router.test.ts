import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { modelFor, chainFor, providerFor, usableChain, TokenLedger, runJson } from './model-router';
import { breaker, ProviderGate, gateFor, TokenBucket, FairQueue } from './resilience';
import { ProviderError, parseRetryAfter, backoffMs, RETRYABLE_STATUS } from './provider-error';
import { PROVIDERS, PROVIDER_IDS, resolveModel, keysFor, isConfigured } from './providers';
import { keyring, resetKeyrings } from './keyring';
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
    // The volume tiers lead on Groq because its free budget is ~13,000
    // requests/day against OpenRouter's 50; structured stays on Gemini because
    // nothing else here matches it for JSON fidelity.
    expect(modelFor('nano')).toBe('groq:llama-3.1-8b-instant');
    expect(modelFor('structured')).toBe('gemini-2.5-flash');
    expect(modelFor('chat')).toBe('groq:llama-3.3-70b-versatile');
  });

  it('gives every tier a deep fallback chain', () => {
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      expect(chainFor(tier).length).toBeGreaterThanOrEqual(6);
    }
  });

  it('spreads every chain across at least four vendors, because free quota is per-vendor', () => {
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      const providers = new Set(chainFor(tier).map((m) => providerFor(m, tier)));
      expect(providers.size).toBeGreaterThanOrEqual(4);
    }
  });

  it('never leads a chain with OpenRouter, whose free slugs cap at 50 requests/day', () => {
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      expect(providerFor(chainFor(tier)[0], tier)).not.toBe('openrouter');
    }
  });

  it('puts a distinct vendor in each of a chain\'s first three slots', () => {
    // The first three are the ones a burst actually reaches. Two Groq slugs in
    // a row would mean a Groq outage costs two attempts instead of one.
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      const head = chainFor(tier).slice(0, 3).map((m) => providerFor(m, tier));
      expect(new Set(head).size).toBe(head.length);
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

  it('routes an explicit provider prefix, and strips it before the call', () => {
    // Half these vendors serve the same Llama weights, so the prefix is the
    // only way to say which copy a chain entry means — and Groq has never
    // heard of a model called "groq:llama-3.3-70b-versatile".
    expect(resolveModel('groq:llama-3.3-70b-versatile')).toEqual({
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
    });
    expect(resolveModel('cerebras:llama-3.3-70b')).toEqual({
      provider: 'cerebras',
      model: 'llama-3.3-70b',
    });
  });

  it('keeps a vendor-prefixed model intact when the provider prefix is also present', () => {
    expect(resolveModel('groq:openai/gpt-oss-120b')).toEqual({
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    });
  });

  it('does not mistake a :free suffix for a provider prefix', () => {
    // `minimax/minimax-m3:free` contains a colon but no provider prefix; a
    // naive split on the first colon would route it to a provider called
    // "minimax/minimax-m3".
    expect(resolveModel('minimax/minimax-m3:free').provider).toBe('openrouter');
    expect(resolveModel('minimax/minimax-m3:free').model).toBe('minimax/minimax-m3:free');
  });

  it('resolves a bare registry slug without a prefix', () => {
    expect(resolveModel('llama-3.1-8b-instant').provider).toBe('groq');
    expect(resolveModel('mistral-small-latest').provider).toBe('mistral');
  });
});

describe('provider registry', () => {
  it('declares a key env var, endpoint and free-tier limit for every provider', () => {
    for (const id of PROVIDER_IDS) {
      const spec = PROVIDERS[id];
      expect(spec.keyEnv).toMatch(/^[A-Z0-9_]+$/);
      expect(spec.rpm).toBeGreaterThan(0);
      expect(spec.concurrency).toBeGreaterThan(0);
      expect(spec.signup).toMatch(/^https:\/\//);
    }
  });

  it('holds at least six independent vendors, which is the whole anti-rate-limit strategy', () => {
    expect(PROVIDER_IDS.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every provider a distinct key env var', () => {
    const envs = PROVIDER_IDS.map((id) => PROVIDERS[id].keyEnv);
    expect(new Set(envs).size).toBe(envs.length);
  });

  it('splits a comma-separated key list into independent identities', () => {
    const saved = process.env.GROQ_API_KEY;
    try {
      process.env.GROQ_API_KEY = 'gsk_one, gsk_two ,"gsk_three"';
      expect(keysFor('groq')).toEqual(['gsk_one', 'gsk_two', 'gsk_three']);
      expect(isConfigured('groq')).toBe(true);
    } finally {
      if (saved === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = saved;
    }
  });

  it('de-duplicates a repeated key, which would otherwise double-count the quota', () => {
    const saved = process.env.GROQ_API_KEY;
    try {
      process.env.GROQ_API_KEY = 'gsk_same,gsk_same';
      expect(keysFor('groq')).toEqual(['gsk_same']);
    } finally {
      if (saved === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = saved;
    }
  });

  it('treats Cloudflare as unconfigured without its account id', () => {
    const savedToken = process.env.CLOUDFLARE_API_TOKEN;
    const savedAccount = process.env.CLOUDFLARE_ACCOUNT_ID;
    try {
      process.env.CLOUDFLARE_API_TOKEN = 'cf_token';
      delete process.env.CLOUDFLARE_ACCOUNT_ID;
      expect(isConfigured('cloudflare')).toBe(false);
      process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
      expect(isConfigured('cloudflare')).toBe(true);
    } finally {
      if (savedToken === undefined) delete process.env.CLOUDFLARE_API_TOKEN;
      else process.env.CLOUDFLARE_API_TOKEN = savedToken;
      if (savedAccount === undefined) delete process.env.CLOUDFLARE_ACCOUNT_ID;
      else process.env.CLOUDFLARE_ACCOUNT_ID = savedAccount;
    }
  });
});

describe('usableChain', () => {
  const ALL_KEYS = PROVIDER_IDS.map((id) => PROVIDERS[id].keyEnv);
  let saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    saved = Object.fromEntries(ALL_KEYS.map((k) => [k, process.env[k]]));
    ALL_KEYS.forEach((k) => delete process.env[k]);
    resetKeyrings();
  });

  afterEach(() => {
    ALL_KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k]!;
    });
    resetKeyrings();
  });

  it('drops models whose provider has no key, rather than turning them into failed attempts', () => {
    process.env.GROQ_API_KEY = 'gsk_test';
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      const chain = usableChain(tier);
      expect(chain.length).toBeGreaterThan(0);
      for (const ref of chain) expect(providerFor(ref, tier)).toBe('groq');
    }
  });

  it('keeps every model when every provider is configured', () => {
    ALL_KEYS.forEach((k) => (process.env[k] = 'test-key'));
    process.env.CLOUDFLARE_ACCOUNT_ID = 'acct';
    for (const tier of ['nano', 'structured', 'chat'] as const) {
      expect(usableChain(tier)).toEqual(chainFor(tier));
    }
    delete process.env.CLOUDFLARE_ACCOUNT_ID;
  });

  it('fails with an actionable message when nothing is configured at all', () => {
    // The old behaviour was to attempt every model and report ten auth
    // failures, which said nothing about the actual problem.
    expect(() => usableChain('structured')).toThrow(/No AI provider is configured/);
    expect(() => usableChain('structured')).toThrow(/GEMINI_API_KEY/);
  });
});

describe('TokenBucket', () => {
  it('allows an immediate burst on a cold start', () => {
    // A cold process must not be artificially slow: the first requests are the
    // ones a learner is watching a spinner for.
    const bucket = new TokenBucket('test', 30);
    expect(bucket.waitMs()).toBe(0);
    bucket.take();
    expect(bucket.waitMs()).toBe(0);
  });

  it('makes callers wait once the burst allowance is spent', () => {
    const bucket = new TokenBucket('test', 6);
    for (let i = 0; i < 10; i++) bucket.take();
    expect(bucket.waitMs()).toBeGreaterThan(0);
  });

  it('halves its own rate when a 429 proves the published limit wrong', () => {
    const bucket = new TokenBucket('test', 60);
    expect(bucket.stats.rpm).toBe(60);
    bucket.penalise();
    expect(bucket.stats.rpm).toBe(30);
    bucket.penalise();
    expect(bucket.stats.rpm).toBe(15);
  });

  it('honours an upstream Retry-After exactly, rather than guessing shorter', () => {
    const bucket = new TokenBucket('test', 60);
    bucket.penalise(5_000);
    const wait = bucket.waitMs();
    expect(wait).toBeGreaterThan(4_000);
    expect(wait).toBeLessThanOrEqual(5_000);
  });

  it('blocks for a long time once the daily allowance is gone', () => {
    // A per-minute backoff never clears a daily cap, so the bucket has to be
    // able to say "not today" rather than "in twenty seconds".
    const bucket = new TokenBucket('test', 60, 3);
    for (let i = 0; i < 3; i++) bucket.take();
    expect(bucket.waitMs()).toBeGreaterThan(60_000);
  });

  it('counts daily spend so a per-minute bucket cannot burn a day in an hour', () => {
    const bucket = new TokenBucket('test', 60, 100);
    bucket.take();
    bucket.take();
    expect(bucket.stats.spentToday).toBe(2);
    expect(bucket.stats.dailyLimit).toBe(100);
  });

  it('resets cleanly for the next test', () => {
    const bucket = new TokenBucket('test', 60);
    bucket.penalise(30_000);
    bucket.reset();
    expect(bucket.waitMs()).toBe(0);
    expect(bucket.stats.rpm).toBe(60);
  });
});

describe('FairQueue', () => {
  it('round-robins between owners instead of serving one owner\'s backlog first', async () => {
    // The scenario: one learner's six-month build submits hundreds of calls
    // while nineteen others each want one drill card. Under FIFO those
    // nineteen wait for the build.
    const queue = new FairQueue();
    const served: string[] = [];

    const waits = [
      queue.wait('builder').then(() => served.push('builder')),
      queue.wait('builder').then(() => served.push('builder')),
      queue.wait('builder').then(() => served.push('builder')),
      queue.wait('learner-b').then(() => served.push('learner-b')),
      queue.wait('learner-c').then(() => served.push('learner-c')),
    ];

    while (queue.next()) {
      /* drain */
    }
    await Promise.all(waits);

    // Both single-request learners are served within the first three slots,
    // not behind all three of the builder's requests.
    expect(served.slice(0, 3)).toContain('learner-b');
    expect(served.slice(0, 3)).toContain('learner-c');
    expect(served).toHaveLength(5);
  });

  it('preserves FIFO order within a single owner', async () => {
    const queue = new FairQueue();
    const served: number[] = [];
    const waits = [
      queue.wait('solo').then(() => served.push(1)),
      queue.wait('solo').then(() => served.push(2)),
      queue.wait('solo').then(() => served.push(3)),
    ];

    while (queue.next()) {
      /* drain */
    }
    await Promise.all(waits);
    expect(served).toEqual([1, 2, 3]);
  });

  it('reports how many distinct owners are waiting', async () => {
    const queue = new FairQueue();
    const waits = [queue.wait('a'), queue.wait('b'), queue.wait('a')];
    expect(queue.owners).toBe(2);
    expect(queue.pending).toBe(3);
    while (queue.next()) {
      /* drain */
    }
    await Promise.all(waits);
    expect(queue.pending).toBe(0);
  });

  it('returns false when there is nothing left to serve', () => {
    expect(new FairQueue().next()).toBe(false);
  });
});

describe('keyring', () => {
  beforeEach(() => resetKeyrings());
  afterEach(() => {
    delete process.env.GROQ_API_KEY;
    resetKeyrings();
  });

  it('reports no keys for an unconfigured provider', () => {
    delete process.env.GROQ_API_KEY;
    expect(keyring('groq').size).toBe(0);
    expect(keyring('groq').waitMs()).toBe(Number.POSITIVE_INFINITY);
  });

  it('turns three keys into three independently metered identities', () => {
    process.env.GROQ_API_KEY = 'k1,k2,k3';
    expect(keyring('groq').size).toBe(3);
    expect(keyring('groq').snapshot()).toHaveLength(3);
  });

  it('spreads requests across keys rather than draining the first one', async () => {
    process.env.GROQ_API_KEY = 'k1,k2,k3';
    const ring = keyring('groq');
    const used = new Set<number>();
    for (let i = 0; i < 3; i++) {
      const claim = await ring.acquire(0);
      expect(claim).not.toBeNull();
      used.add(claim!.index);
    }
    expect(used.size).toBe(3);
  });

  it('penalises only the key that was rate limited', async () => {
    process.env.GROQ_API_KEY = 'k1,k2';
    const ring = keyring('groq');
    ring.penalise(0, 30_000);

    const snapshot = ring.snapshot();
    expect(snapshot[0].waitMs).toBeGreaterThan(1_000);
    // The second key was not implicated by the first key's exhaustion —
    // treating it as if it were is how a multi-key setup ends up no faster
    // than a single-key one.
    expect(snapshot[1].waitMs).toBe(0);
    expect(ring.waitMs()).toBe(0);
  });

  it('refuses a claim rather than waiting longer than the caller allows', async () => {
    process.env.GROQ_API_KEY = 'only';
    const ring = keyring('groq');
    ring.penalise(0, 60_000);
    // Null is the signal that tells the router to try a different vendor
    // instead of sitting in this one's queue.
    expect(await ring.acquire(500)).toBeNull();
  });

  it('does not lose a surviving key\'s learned rate when another key is added', () => {
    process.env.GROQ_API_KEY = 'k1';
    const ring = keyring('groq');
    ring.penalise(0);
    const learned = ring.snapshot()[0].rpm;

    process.env.GROQ_API_KEY = 'k1,k2';
    expect(ring.size).toBe(2);
    // Throwing away what we know about k1's live ceiling would re-trigger the
    // exact 429s the bucket had just learned to avoid.
    expect(ring.snapshot()[0].rpm).toBe(learned);
  });

  it('never puts a raw key in a snapshot', () => {
    process.env.GROQ_API_KEY = 'gsk_supersecret_value';
    const snapshot = keyring('groq').snapshot();
    expect(JSON.stringify(snapshot)).not.toContain('supersecret');
    expect(snapshot[0].fingerprint).toBe('alue');
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
    expect(gateFor('groq')).not.toBe(gateFor('cerebras'));
  });

  it('gives every registry provider a gate', () => {
    for (const id of PROVIDER_IDS) expect(gateFor(id)).toBeDefined();
  });

  it('does not let one owner\'s backlog block another owner', async () => {
    const gate = new ProviderGate('test', { concurrency: 1, minIntervalMs: 0 });
    const order: string[] = [];

    // Occupy the single slot, then queue three from one owner and one from
    // another. The lone learner must not wait behind the whole build.
    const hold = gate.run(async () => {
      await new Promise((r) => setTimeout(r, 30));
    }, 'builder');

    const queued = [
      gate.run(async () => void order.push('builder'), 'builder'),
      gate.run(async () => void order.push('builder'), 'builder'),
      gate.run(async () => void order.push('builder'), 'builder'),
      gate.run(async () => void order.push('learner'), 'learner'),
    ];

    await Promise.all([hold, ...queued]);
    expect(order.indexOf('learner')).toBeLessThan(3);
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
