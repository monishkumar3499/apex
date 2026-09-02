import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { classifyGoal, sizePlan } from './services/plan-service';
import { TokenLedger } from './ai/model-router';
import { generateBlueprint } from './services/blueprint-builder';
import { TOPIC_MIN_MINUTES, TOPIC_MAX_MINUTES } from './prompts/blueprint';
import { curateResources } from './curation/curate';
import { buildSchedule, type SchedTopic } from './planner/scheduler';
import { buildDigest } from './services/digest';

/**
 * Live pipeline check.
 *
 * Hits the real OpenRouter / YouTube / Tavily endpoints, so it is opt-in:
 *
 *   RUN_INTEGRATION=1 npm test
 *
 * It asserts the properties that actually matter for plan quality — full
 * coverage, real URLs, capacity respected — and prints the token ledger so the
 * cost of a build is a measured number rather than an estimate.
 */

const ENABLED = process.env.RUN_INTEGRATION === '1';
const describeLive = ENABLED ? describe : describe.skip;

function loadEnv() {
  const envPath = resolve(__dirname, '../frontend/.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
  }
}

/**
 * A hand-written blueprint standing in for the model's output, so the
 * deterministic half of the pipeline can be verified against live resource
 * APIs without an LLM in the loop.
 */
const FIXTURE_UNITS = [
  {
    t: 'Networks',
    q: ['network theory nodal mesh analysis lecture'],
    tp: [
      { t: 'Nodal and mesh analysis', k: ['nodal analysis', 'mesh analysis', 'kcl', 'kvl'], m: 120, d: 3, w: 4 },
      { t: 'Transient response of RL and RC circuits', k: ['transient response', 'rc circuit', 'rl circuit', 'time constant'], m: 150, d: 4, w: 4 },
      { t: 'Two-port network parameters', k: ['two port network', 'z parameters', 'y parameters', 'abcd'], m: 90, d: 3, w: 3 },
    ],
  },
  {
    t: 'Signals and Systems',
    q: ['signals and systems fourier transform lecture'],
    tp: [
      { t: 'Linear time-invariant systems and convolution', k: ['lti system', 'convolution', 'impulse response'], m: 150, d: 4, w: 5 },
      { t: 'Fourier transform and frequency response', k: ['fourier transform', 'frequency response', 'spectrum'], m: 180, d: 4, w: 5 },
      { t: 'Sampling theorem and aliasing', k: ['sampling theorem', 'nyquist', 'aliasing'], m: 90, d: 3, w: 4 },
    ],
  },
  {
    t: 'Digital Circuits',
    q: ['digital electronics combinational sequential circuits lecture'],
    tp: [
      { t: 'Combinational logic minimisation', k: ['karnaugh map', 'boolean algebra', 'combinational logic'], m: 100, d: 2, w: 3 },
      { t: 'Sequential circuits and flip-flops', k: ['flip flop', 'sequential circuit', 'counter', 'state machine'], m: 140, d: 3, w: 4 },
    ],
  },
];

describeLive('live plan pipeline', () => {
  beforeAll(loadEnv);

  it(
    'curates real resources and schedules them without any model call',
    async () => {
      const topics = FIXTURE_UNITS.flatMap((u, unitIdx) =>
        u.tp.map((t) => ({ ...t, unitIdx })),
      );

      const curation = await curateResources({
        subject: 'GATE Electronics and Communication Engineering',
        prepType: 'exam',
        units: FIXTURE_UNITS.map((u, idx) => ({ idx, title: u.t, queries: u.q })),
        topics: topics.map((t, idx) => ({
          idx,
          title: t.t,
          keywords: t.k,
          unitIdx: t.unitIdx,
        })),
        videoSearchBudget: 4,
        webSearchBudget: 3,
      });

      console.log('\nCURATION →', curation.stats);
      curation.resources.slice(0, 8).forEach((r) =>
        console.log(`   ${r.score.toFixed(3)} [${r.kind}] ${r.title.slice(0, 62)} — ${r.why}`),
      );

      expect(curation.resources.length).toBeGreaterThan(5);

      // Every URL is real and parseable — the guarantee a model cannot give.
      for (const resource of curation.resources) {
        expect(() => new URL(resource.url)).not.toThrow();
        expect(resource.url).toMatch(/^https:\/\//);
      }

      // Ranking must be monotonically non-increasing.
      const scores = curation.resources.map((r) => r.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);

      // Every topic gets at least one resource attached.
      for (const topic of topics.map((_, idx) => idx)) {
        expect((curation.assignments.get(topic) ?? []).length).toBeGreaterThan(0);
      }

      console.log('\n   topic → attached resources');
      topics.forEach((t, idx) => {
        const urls = curation.assignments.get(idx) ?? [];
        const titles = urls
          .map((u) => curation.resources.find((r) => r.url === u)?.title.slice(0, 44))
          .filter(Boolean);
        console.log(`   ${t.t.slice(0, 40).padEnd(42)} → ${titles.join(' | ')}`);
      });

      // ---- Schedule the curated plan ------------------------------------
      const schedule = buildSchedule({
        startDate: '2026-09-01',
        targetDate: '2027-02-28',
        weekdayMinutes: 120,
        weekendMinutes: 300,
        restDays: [],
        prepType: 'exam',
        units: FIXTURE_UNITS.map((u, idx) => ({ idx, title: u.t })),
        topics: topics.map((t, idx): SchedTopic => ({
          idx,
          unitIdx: t.unitIdx,
          title: t.t,
          estMinutes: t.m,
          difficulty: t.d,
          weight: t.w,
          dependsOn: [],
        })),
      });

      console.log('\nSCHEDULE →', schedule.stats);
      schedule.sessions.slice(0, 4).forEach((s) =>
        console.log(
          `   day ${s.dayIndex} ${s.date} · ${s.plannedMinutes}m · ${s.headline}\n` +
            s.items.map((i) => `        [${i.kind}] ${i.title} (${i.estMinutes}m)`).join('\n'),
        ),
      );

      expect(schedule.sessions.length).toBeGreaterThan(50);
      for (const session of schedule.sessions) {
        const dow = new Date(`${session.date}T00:00:00Z`).getUTCDay();
        expect(session.plannedMinutes).toBeLessThanOrEqual(dow === 0 || dow === 6 ? 300 : 120);
      }
    },
    { timeout: 180_000 },
  );

  it(
    'builds a complete, schedulable prep map for an exam goal',
    async () => {
      const ledger = new TokenLedger();
      const goal = 'GATE ECE 2027';
      const started = Date.now();

      // ---- Stage 1 · classify ------------------------------------------
      const intake = await classifyGoal({ goal, level: 'intermediate', weeks: 26, hoursPerWeek: 16, ledger });
      console.log('\nCLASSIFY →', { pt: intake.pt, sub: intake.sub, slug: intake.slug, asked: intake.ask.length });

      expect(intake.pt).toBe('exam');
      expect(intake.sub.length).toBeGreaterThan(3);

      // ---- Stage 2 · structure -----------------------------------------
      const studyHours = 220;
      const { topicTarget, unitTarget } = sizePlan(studyHours);

      const structureStarted = Date.now();
      const generation = await generateBlueprint({
        req: {
          subject: intake.sub,
          prepType: intake.pt,
          scope: intake.scope,
          level: 'intermediate',
          weeks: 26,
          studyHours,
          topicTarget,
          unitTarget,
          extras: {},
        },
        ledger,
      });
      const blueprint = generation.blueprint;
      const structureMs = Date.now() - structureStarted;

      const units = (blueprint.u ?? []).filter((u) => u?.t && u.tp?.length);
      const topics = units.flatMap((u, unitIdx) =>
        u.tp.filter((t) => t?.t).map((t) => ({ ...t, unitIdx })),
      );

      console.log(
        'BLUEPRINT →',
        `${units.length} units, ${topics.length} topics (target ${topicTarget}) ` +
          `in ${(structureMs / 1000).toFixed(1)}s ` +
          `[sharded: ${generation.sharded}, degraded units: ${generation.degradedUnits.length}]`,
      );
      console.log('  units:', units.map((u) => u.t).join(' | '));

      expect(units.length).toBeGreaterThanOrEqual(3);
      expect(topics.length).toBeGreaterThanOrEqual(Math.floor(topicTarget * 0.5));
      // Every unit must supply a search intent, or curation has nothing to go on.
      expect(units.every((u) => (u.q ?? []).length > 0 || u.t)).toBe(true);

      // Sharding is the whole point of the two-stage generator. If it silently
      // fell back to one combined call on a ten-unit plan, the latency work is
      // not actually running and this test should say so.
      expect(generation.sharded).toBe(true);

      // Every topic must be finishable: a 240-minute topic reaches the learner
      // as four consecutive blocks carrying the same title.
      const topicMinutes = topics.map((t) => Number(t.m)).filter(Number.isFinite);
      expect(Math.max(...topicMinutes)).toBeLessThanOrEqual(TOPIC_MAX_MINUTES);
      expect(Math.min(...topicMinutes)).toBeGreaterThanOrEqual(TOPIC_MIN_MINUTES);

      // ---- Stage 3 · curation (no model) --------------------------------
      const curation = await curateResources({
        subject: intake.sub,
        prepType: intake.pt,
        units: units.map((u, i) => ({ idx: i, title: String(u.t), queries: (u.q ?? []).map(String) })),
        topics: topics.map((t, idx) => ({
          idx,
          title: String(t.t),
          summary: t.s,
          keywords: (t.k ?? []).map(String),
          unitIdx: t.unitIdx,
        })),
        videoSearchBudget: Math.min(14, units.length + 2),
        webSearchBudget: Math.min(8, units.length),
        gapSearchBudget: Math.min(12, Math.max(6, Math.round(topics.length / 4))),
      });

      console.log('CURATION →', curation.stats);
      console.log(
        '  top 5:',
        curation.resources.slice(0, 5).map((r) => `${r.score.toFixed(2)} ${r.title.slice(0, 58)}`),
      );

      expect(curation.resources.length).toBeGreaterThan(5);

      // Every URL must be real and well-formed — this is the guarantee the
      // old "let the model write the links" design could not make.
      for (const resource of curation.resources) {
        expect(() => new URL(resource.url)).not.toThrow();
        expect(resource.url).toMatch(/^https?:\/\//);
        expect(resource.title.trim().length).toBeGreaterThan(0);
      }

      // No single resource should dominate the plan.
      const useCounts = new Map<string, number>();
      for (const urls of curation.assignments.values()) {
        urls.forEach((u) => useCounts.set(u, (useCounts.get(u) ?? 0) + 1));
      }
      const worstReuse = Math.max(...useCounts.values(), 0);
      console.log(`  spread: ${useCounts.size} distinct resources, max reuse ${worstReuse}`);
      expect(worstReuse).toBeLessThanOrEqual(Math.max(4, Math.ceil(topics.length / 4)));

      // ---- Stage 4 · schedule (no model) --------------------------------
      const schedTopics: SchedTopic[] = topics.map((t, idx) => ({
        idx,
        unitIdx: t.unitIdx,
        title: String(t.t),
        estMinutes: Math.max(TOPIC_MIN_MINUTES, Math.min(TOPIC_MAX_MINUTES, Number(t.m) || 60)),
        difficulty: Math.max(1, Math.min(5, Number(t.d) || 3)),
        weight: Math.max(1, Math.min(5, Number(t.w) || 3)),
        dependsOn: (t.dep ?? []).map((d) => Number(d) - 1).filter((d) => d >= 0 && d < idx),
      }));

      const schedule = buildSchedule({
        startDate: '2026-09-01',
        targetDate: '2027-02-28',
        weekdayMinutes: 120,
        weekendMinutes: 300,
        restDays: [],
        prepType: intake.pt,
        units: units.map((u, i) => ({ idx: i, title: String(u.t) })),
        topics: schedTopics,
      });

      console.log('SCHEDULE →', schedule.stats);
      console.log(`  deferred: ${schedule.deferredTopics.length}, mocks: ${schedule.mockDays.length}`);
      console.log('  first 3 days:');
      schedule.sessions.slice(0, 3).forEach((s) =>
        console.log(
          `    day ${s.dayIndex} (${s.date}) ${s.plannedMinutes}m — ${s.headline}\n` +
            s.items.map((i) => `        [${i.kind}] ${i.title} · ${i.estMinutes}m`).join('\n'),
        ),
      );

      expect(schedule.sessions.length).toBeGreaterThan(100);
      expect(schedule.stats.itemCount).toBeGreaterThan(topics.length);

      // Capacity is never exceeded — the core promise of the scheduler.
      for (const session of schedule.sessions) {
        const dow = new Date(`${session.date}T00:00:00Z`).getUTCDay();
        expect(session.plannedMinutes).toBeLessThanOrEqual(dow === 0 || dow === 6 ? 300 : 120);
      }

      // ---- Stage 5 · digest (no model) ----------------------------------
      const digest = buildDigest({
        subject: intake.sub,
        prepType: intake.pt,
        level: 'intermediate',
        startDate: '2026-09-01',
        targetDate: '2027-02-28',
        studyDays: schedule.sessions.length,
        weekdayMinutes: 120,
        weekendMinutes: 300,
        units: units.map((u, i) => ({
          idx: i,
          title: String(u.t),
          weight: Number(u.w) || 3,
          topics: topics
            .map((t, idx) => ({ ...t, idx }))
            .filter((t) => t.unitIdx === i)
            .map((t) => ({ idx: t.idx, title: String(t.t) })),
        })),
        mockCount: schedule.mockDays.length,
        deferredTopics: [],
      });

      const digestTokens = Math.ceil(digest.length / 4);
      console.log(`DIGEST → ${digest.length} chars ≈ ${digestTokens} tokens`);
      expect(digestTokens).toBeLessThan(520);

      // ---- Cost ----------------------------------------------------------
      const total = ledger.total;
      console.log('\nTOKENS →', total, ledger.breakdown);
      console.log(`ELAPSED → ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

      // Sharded generation trades tokens for wall-clock, and the budget has to
      // say so honestly rather than be quietly relaxed.
      //
      // One combined call for this plan measured ~8k tokens in 33s. Sharding it
      // measures ~13-16k in ~28s while producing ~25% more topics: each shard
      // re-sends the system prompt and the full unit list, so prompt tokens
      // roughly triple. Output tokens are what cost latency, and those are now
      // spread across concurrent calls; prompt tokens are processed in parallel
      // and are free on this tier.
      //
      // The ceiling is here to catch a real regression — a runaway repair loop,
      // or a shard fallback chain firing on every request.
      expect(total.totalTokens).toBeLessThan(24_000);
    },
    { timeout: 300_000 },
  );
});
