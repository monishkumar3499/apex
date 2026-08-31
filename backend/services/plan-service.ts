import { createHash } from 'crypto';
import { admin, must } from '../db/supabase';
import { runJson, TokenLedger } from '../ai/model-router';
import { INTAKE_SYSTEM, INTAKE_SCHEMA_HINT, intakeUser, type IntakeResult } from '../prompts/intake';
import {
  BLUEPRINT_SYSTEM,
  BLUEPRINT_SCHEMA_HINT,
  blueprintUser,
  normalizeBlueprint,
  type BlueprintResult,
} from '../prompts/blueprint';
import { welcomeMessage } from '../prompts/coach';
import { curateResources } from '../curation/curate';
import { buildSchedule, type SchedTopic } from '../planner/scheduler';
import { diffDays, todayIso } from '../planner/calendar';
import { buildDigest } from './digest';
import { slugify } from '../curation/text';
import { logger } from '../logger/pino';

/**
 * Plan build orchestration.
 *
 * Two model calls total, regardless of plan size:
 *   1. classify  (nano tier, ~400 tokens)
 *   2. blueprint (structured tier, ~2,300 tokens — skipped entirely on a cache hit)
 *
 * Everything else — resource discovery, scheduling, the digest, the welcome
 * message — is code. A 26-week plan costs about 2.7k tokens to build.
 */

export interface PlanInput {
  userId: string;
  title: string;
  level: string;
  startDate: string;
  targetDate: string;
  weekdayMinutes: number;
  weekendMinutes: number;
  restDays: number[];
  extras?: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Stage 1 · classification
// ---------------------------------------------------------------------------

export async function classifyGoal(params: {
  goal: string;
  level: string;
  weeks: number;
  hoursPerWeek: number;
  ledger?: TokenLedger;
}): Promise<IntakeResult> {
  try {
    const result = await runJson<IntakeResult>({
      tier: 'nano',
      label: 'classify',
      temperature: 0.1,
      // The answer is ~180 tokens, but on a reasoning model the thinking is
      // billed against this same budget and silently truncates the JSON.
      maxTokens: 2000,
      reasoning: { effort: 'low' },
      schemaHint: INTAKE_SCHEMA_HINT,
      ledger: params.ledger,
      messages: [
        { role: 'system', content: INTAKE_SYSTEM },
        { role: 'user', content: intakeUser(params.goal, params.level, params.weeks, params.hoursPerWeek) },
      ],
    });

    return {
      pt: ['exam', 'skill', 'hybrid'].includes(result.pt) ? result.pt : 'skill',
      sub: result.sub?.trim() || params.goal,
      slug: result.slug?.trim() || slugify(params.goal),
      lvl: result.lvl?.trim() || params.level,
      conf: Number(result.conf ?? 0.5),
      scope: result.scope?.trim() || `Working competence in ${params.goal}`,
      ask: Array.isArray(result.ask) ? result.ask.filter((a) => a?.q && a.opts?.length >= 2).slice(0, 2) : [],
    };
  } catch (error) {
    // Classification must never block plan creation — but a silent fallback
    // looks identical to a confident verdict, so mark it. buildPlan turns the
    // flag into a plan_event, and /api/health reports the underlying cause.
    const reason = error instanceof Error ? error.message : String(error);
    logger.error({ error, goal: params.goal }, 'classification failed, falling back to skill blueprint');
    return {
      pt: 'skill',
      sub: params.goal,
      slug: slugify(params.goal),
      lvl: params.level,
      conf: 0,
      scope: `Working competence in ${params.goal}`,
      ask: [],
      degraded: true,
      degradedReason: reason.slice(0, 300),
    };
  }
}

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

/**
 * How many topics a plan should contain.
 *
 * Anchored to real study capacity, not to a fixed number. Roughly one topic
 * per 2.5 hours of first-pass study, because each topic also carries practice
 * and three review passes.
 */
export function sizePlan(studyHours: number): { topicTarget: number; unitTarget: number } {
  const topicTarget = Math.max(10, Math.min(70, Math.round(studyHours / 2.5)));
  const unitTarget = Math.max(3, Math.min(10, Math.round(topicTarget / 5)));
  return { topicTarget, unitTarget };
}

function capacityMinutes(input: {
  startDate: string;
  targetDate: string;
  weekdayMinutes: number;
  weekendMinutes: number;
  restDays: number[];
}): number {
  const span = Math.max(1, diffDays(input.startDate, input.targetDate));
  const rest = new Set(input.restDays);
  let total = 0;
  for (let i = 0; i <= span && i < 540; i++) {
    const dow = new Date(new Date(`${input.startDate}T00:00:00Z`).getTime() + i * 86_400_000).getUTCDay();
    if (rest.has(dow)) continue;
    total += dow === 0 || dow === 6 ? input.weekendMinutes : input.weekdayMinutes;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Plan creation
// ---------------------------------------------------------------------------

export async function createPlan(input: PlanInput & { intake: IntakeResult }) {
  const db = admin();

  const plan = must(
    await db
      .from('plans')
      .insert({
        user_id: input.userId,
        title: input.title.trim(),
        prep_type: input.intake.pt,
        subject_slug: input.intake.slug,
        status: 'building',
        start_date: input.startDate,
        target_date: input.targetDate,
        weekday_minutes: input.weekdayMinutes,
        weekend_minutes: input.weekendMinutes,
        rest_days: input.restDays,
        skill_level: input.intake.lvl || input.level,
        intake: { ...(input.extras ?? {}), subject: input.intake.sub, scope: input.intake.scope },
        blueprint: input.intake as unknown as Record<string, unknown>,
      })
      .select()
      .single(),
    'createPlan',
  );

  return plan;
}

// ---------------------------------------------------------------------------
// Build pipeline
// ---------------------------------------------------------------------------

async function event(planId: string, userId: string, stage: string, status: string, message: string, meta: Record<string, unknown> = {}) {
  try {
    await admin().from('plan_events').insert({ plan_id: planId, user_id: userId, stage, status, message, meta });
  } catch (error) {
    logger.warn({ error, planId, stage }, 'failed to record plan event');
  }
}

const cacheKey = (slug: string, prepType: string, level: string, hours: number) =>
  createHash('sha1')
    // Bucket hours so "119h" and "124h" share a skeleton instead of both paying for generation.
    .update([slug, prepType, level, Math.round(hours / 25) * 25].join('|'))
    .digest('hex');

export async function buildPlan(planId: string): Promise<void> {
  const db = admin();
  const ledger = new TokenLedger();
  const started = Date.now();

  const plan = must(await db.from('plans').select('*').eq('id', planId).single(), 'loadPlan');
  const userId: string = plan.user_id;
  const intake = (plan.blueprint ?? {}) as IntakeResult;
  const subject: string = plan.intake?.subject ?? plan.title;

  try {
    // A degraded intake means the goal was never actually classified, so the
    // prep type and scope below are defaults. Record it against the build.
    if (intake.degraded) {
      await event(planId, userId, 'classify', 'warn', 'Goal was not classified — using a generic skill plan', {
        reason: intake.degradedReason ?? 'unknown',
      });
    }

    // ---- Sizing --------------------------------------------------------
    const totalCapacity = capacityMinutes({
      startDate: plan.start_date,
      targetDate: plan.target_date,
      weekdayMinutes: plan.weekday_minutes,
      weekendMinutes: plan.weekend_minutes,
      restDays: plan.rest_days ?? [],
    });
    // ~55% of capacity is first-pass learning; the rest is practice + review.
    const studyHours = Math.round((totalCapacity * 0.55) / 60);
    const weeks = Math.max(1, Math.round(diffDays(plan.start_date, plan.target_date) / 7));
    const { topicTarget, unitTarget } = sizePlan(studyHours);

    // ---- Stage 2 · structure (cached across users) ----------------------
    await event(planId, userId, 'structure', 'running', `Designing ${topicTarget} topics across ${unitTarget} units`);

    const key = cacheKey(plan.subject_slug ?? slugify(subject), plan.prep_type, plan.skill_level, studyHours);
    const cached = await db.from('blueprint_cache').select('payload, hits').eq('cache_key', key).maybeSingle();

    let blueprint: BlueprintResult;
    if (cached.data?.payload) {
      // Normalised again on read: entries cached before normalisation existed
      // can still hold a bare string where the schema promised a list.
      blueprint = normalizeBlueprint(cached.data.payload);
      await db
        .from('blueprint_cache')
        .update({ hits: (cached.data.hits ?? 0) + 1, updated_at: new Date().toISOString() })
        .eq('cache_key', key);
      await event(planId, userId, 'structure', 'ok', 'Reused a verified structure for this subject', { cached: true });
    } else {
      const generated = await runJson<BlueprintResult>({
        tier: 'structured',
        label: 'blueprint',
        temperature: 0.25,
        // A 37-topic blueprint is ~3k tokens of JSON. The headroom above that
        // is for reasoning models, which bill their thinking against the same
        // budget — at 6000 they spent it all thinking and returned nothing.
        maxTokens: 16000,
        reasoning: { effort: 'low' },
        schemaHint: BLUEPRINT_SCHEMA_HINT,
        ledger,
        messages: [
          { role: 'system', content: BLUEPRINT_SYSTEM },
          {
            role: 'user',
            content: blueprintUser({
              subject,
              prepType: plan.prep_type,
              scope: intake.scope ?? `Working competence in ${subject}`,
              level: plan.skill_level,
              weeks,
              studyHours,
              topicTarget,
              unitTarget,
              extras: (plan.intake ?? {}) as Record<string, string>,
            }),
          },
        ],
      });

      // Normalise before caching so the shape is fixed once, not on every read.
      blueprint = normalizeBlueprint(generated);

      if (blueprint.u.length) {
        await db.from('blueprint_cache').upsert({ cache_key: key, payload: blueprint as any, hits: 1 });
      }
      await event(planId, userId, 'structure', 'ok', `Mapped ${blueprint.u.length} units`);
    }

    const units = (blueprint.u ?? []).filter((u) => u?.t && Array.isArray(u.tp) && u.tp.length);
    if (!units.length) throw new Error('The model returned no usable structure for this goal');

    // ---- Persist units & topics ----------------------------------------
    const unitRows = units.map((u, i) => ({
      plan_id: planId,
      user_id: userId,
      idx: i,
      title: String(u.t).slice(0, 200),
      summary: u.s ? String(u.s).slice(0, 500) : null,
      weight: Math.max(1, Math.min(5, Number(u.w) || 3)),
    }));
    const savedUnits = must(await db.from('units').insert(unitRows).select('id, idx'), 'insertUnits');
    const unitIdById = new Map(savedUnits.map((u: any) => [u.idx, u.id]));

    let topicOrdinal = 0;
    const topicRows = units.flatMap((u, unitIdx) =>
      u.tp.filter((t) => t?.t).map((t) => {
        const idx = topicOrdinal++;
        return {
          plan_id: planId,
          user_id: userId,
          unit_id: unitIdById.get(unitIdx),
          idx,
          title: String(t.t).slice(0, 200),
          summary: t.s ? String(t.s).slice(0, 600) : null,
          outcomes: (t.o ?? []).slice(0, 4).map((o) => String(o).slice(0, 200)),
          keywords: (t.k ?? []).slice(0, 8).map((k) => String(k).toLowerCase().slice(0, 60)),
          est_minutes: Math.max(20, Math.min(360, Number(t.m) || 75)),
          difficulty: Math.max(1, Math.min(5, Number(t.d) || 3)),
          weight: Math.max(1, Math.min(5, Number(t.w) || 3)),
          // Model emits 1-based global ordinals; store 0-based and drop forward refs.
          depends_on: (t.dep ?? [])
            .map((d) => Number(d) - 1)
            .filter((d) => Number.isInteger(d) && d >= 0 && d < idx),
          _unitIdx: unitIdx,
        };
      }),
    );

    const savedTopics = must(
      await db.from('topics').insert(topicRows.map(({ _unitIdx, ...row }) => row)).select('id, idx'),
      'insertTopics',
    );
    const topicIdByIdx = new Map(savedTopics.map((t: any) => [t.idx, t.id]));

    await event(planId, userId, 'topics', 'ok', `${topicRows.length} topics structured`);

    // ---- Stage 3 · resource curation (no model involved) ----------------
    await event(planId, userId, 'resources', 'running', 'Finding and ranking real study material');

    const curation = await curateResources({
      subject,
      prepType: plan.prep_type,
      units: units.map((u, i) => ({ idx: i, title: String(u.t), queries: (u.q ?? []).map(String) })),
      topics: topicRows.map((t) => ({
        idx: t.idx,
        title: t.title,
        summary: t.summary ?? undefined,
        keywords: t.keywords,
        unitIdx: t._unitIdx,
      })),
    });

    const resourceIdByUrl = new Map<string, string>();
    if (curation.resources.length) {
      const resourceRows = curation.resources.map((r) => ({
        plan_id: planId,
        user_id: userId,
        kind: r.kind,
        title: r.title.slice(0, 300),
        url: r.url,
        source: r.source,
        author: r.author?.slice(0, 200) ?? null,
        description: r.description?.slice(0, 800) ?? null,
        thumbnail_url: r.thumbnailUrl,
        duration_sec: r.durationSec,
        published_at: r.publishedAt,
        metrics: r.metrics,
        score: r.score,
        why: r.why?.slice(0, 200) ?? null,
      }));

      // Same 21000 hazard as the links below: the conflict target is
      // (plan_id, url), so the payload must not carry a URL twice.
      const uniqueResourceRows = [...new Map(resourceRows.map((r) => [r.url, r])).values()];

      const savedResources = must(
        await db.from('resources').upsert(uniqueResourceRows, { onConflict: 'plan_id,url' }).select('id, url'),
        'insertResources',
      );
      savedResources.forEach((r: any) => resourceIdByUrl.set(r.url, r.id));

      // topic_resources is keyed on (topic_id, resource_id). Curation can rank
      // the same URL twice within one topic, and Postgres rejects an upsert
      // whose payload touches the same key twice ("ON CONFLICT DO UPDATE
      // command cannot affect row a second time", SQLSTATE 21000). Keep the
      // best rank per pair so the statement stays valid.
      const linkByKey = new Map<string, { topic_id: string; resource_id: string; plan_id: string; user_id: string; rank: number }>();
      for (const [topicIdx, urls] of curation.assignments.entries()) {
        const topicId = topicIdByIdx.get(topicIdx);
        if (!topicId) continue;

        urls.forEach((url, rank) => {
          const resourceId = resourceIdByUrl.get(url);
          if (!resourceId) return;

          const key = `${topicId}:${resourceId}`;
          const existing = linkByKey.get(key);
          if (existing && existing.rank <= rank) return;
          linkByKey.set(key, {
            topic_id: topicId,
            resource_id: resourceId,
            plan_id: planId,
            user_id: userId,
            rank,
          });
        });
      }

      const links = [...linkByKey.values()];
      if (links.length) {
        must(await db.from('topic_resources').upsert(links).select('topic_id'), 'linkResources');
      }
    }

    await event(
      planId,
      userId,
      'resources',
      'ok',
      `${curation.resources.length} verified resources attached`,
      curation.stats,
    );

    // ---- Stage 4 · schedule (no model involved) -------------------------
    await event(planId, userId, 'schedule', 'running', 'Laying out your day-by-day map');

    const schedTopics: SchedTopic[] = topicRows.map((t) => ({
      idx: t.idx,
      unitIdx: t._unitIdx,
      title: t.title,
      estMinutes: t.est_minutes,
      difficulty: t.difficulty,
      weight: t.weight,
      dependsOn: t.depends_on,
    }));

    const schedule = buildSchedule({
      startDate: plan.start_date,
      targetDate: plan.target_date,
      weekdayMinutes: plan.weekday_minutes,
      weekendMinutes: plan.weekend_minutes,
      restDays: plan.rest_days ?? [],
      prepType: plan.prep_type,
      units: units.map((u, i) => ({ idx: i, title: String(u.t) })),
      topics: schedTopics,
    });

    if (!schedule.sessions.length) throw new Error('No study days available between the start and target dates');

    const sessionRows = schedule.sessions.map((s) => ({
      plan_id: planId,
      user_id: userId,
      day_index: s.dayIndex,
      scheduled_on: s.date,
      planned_minutes: s.plannedMinutes,
      headline: s.headline?.slice(0, 200) ?? null,
    }));
    const savedSessions = must(
      await db.from('sessions').insert(sessionRows).select('id, day_index'),
      'insertSessions',
    );
    const sessionIdByDay = new Map(savedSessions.map((s: any) => [s.day_index, s.id]));

    // Resolve each item's resource from the topic's ranked list, in code.
    const rankedByTopic = new Map<number, string[]>(curation.assignments);
    const itemRows = schedule.sessions.flatMap((s) =>
      s.items.map((item, i) => {
        let resourceId: string | null = null;
        if (item.topicIdx !== null && item.resourceRank !== null) {
          const urls = rankedByTopic.get(item.topicIdx) ?? [];
          const url = urls[item.resourceRank] ?? urls[0];
          resourceId = url ? resourceIdByUrl.get(url) ?? null : null;
        }
        return {
          session_id: sessionIdByDay.get(s.dayIndex),
          plan_id: planId,
          user_id: userId,
          topic_id: item.topicIdx !== null ? topicIdByIdx.get(item.topicIdx) ?? null : null,
          resource_id: resourceId,
          idx: i,
          kind: item.kind,
          title: item.title.slice(0, 300),
          detail: item.detail?.slice(0, 1000) ?? null,
          est_minutes: item.estMinutes,
        };
      }).filter((r) => r.session_id),
    );

    // Chunked insert — a year-long plan can exceed 2,000 rows.
    for (let i = 0; i < itemRows.length; i += 500) {
      must(await db.from('session_items').insert(itemRows.slice(i, i + 500)).select('id'), 'insertItems');
    }

    // Scheduled mocks get a first-class row so the drill surface can find them.
    if (schedule.mockDays.length) {
      const mockRows = schedule.mockDays.map((day, i) => {
        const session = schedule.sessions.find((s) => s.dayIndex === day);
        return {
          plan_id: planId,
          user_id: userId,
          title: `Mock ${i + 1}`,
          scheduled_on: session?.date ?? null,
          duration_min: plan.prep_type === 'exam' ? 120 : 75,
        };
      });
      await db.from('mocks').insert(mockRows);
    }

    await event(planId, userId, 'schedule', 'ok', `${schedule.sessions.length} study days scheduled`, schedule.stats);

    // ---- Stage 5 · digest, chat, finish ---------------------------------
    const deferredTitles = schedule.deferredTopics
      .map((idx) => topicRows.find((t) => t.idx === idx)?.title)
      .filter(Boolean) as string[];

    const digest = buildDigest({
      subject,
      prepType: plan.prep_type,
      level: plan.skill_level,
      startDate: plan.start_date,
      targetDate: plan.target_date,
      studyDays: schedule.sessions.length,
      weekdayMinutes: plan.weekday_minutes,
      weekendMinutes: plan.weekend_minutes,
      units: units.map((u, i) => ({
        idx: i,
        title: String(u.t),
        weight: Math.max(1, Math.min(5, Number(u.w) || 3)),
        topics: topicRows.filter((t) => t._unitIdx === i).map((t) => ({ idx: t.idx, title: t.title })),
      })),
      mockCount: schedule.mockDays.length,
      deferredTopics: deferredTitles,
    });

    const chat = must(
      await db.from('chats').upsert({ plan_id: planId, user_id: userId }, { onConflict: 'plan_id' }).select().single(),
      'createChat',
    );

    await db.from('messages').insert({
      chat_id: chat.id,
      user_id: userId,
      role: 'assistant',
      content: welcomeMessage(subject, topicRows[0]?.title ?? null, schedule.sessions.length),
    });

    must(
      await db
        .from('plans')
        .update({ status: 'ready', digest, build_error: null })
        .eq('id', planId)
        .select('id')
        .single(),
      'finalisePlan',
    );

    const usage = ledger.total;
    await event(planId, userId, 'ready', 'ok', 'Your prep map is ready', {
      ms: Date.now() - started,
      tokens: usage.totalTokens,
      breakdown: ledger.breakdown,
      ...schedule.stats,
    });

    logger.info(
      { planId, ms: Date.now() - started, tokens: usage.totalTokens, items: itemRows.length },
      'plan.build.complete',
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Plan build failed';
    logger.error({ error, planId }, 'plan.build.failed');
    await event(planId, userId, 'failed', 'error', message);
    await admin().from('plans').update({ status: 'failed', build_error: message }).eq('id', planId);
  }
}

// ---------------------------------------------------------------------------
// Adaptive replan
// ---------------------------------------------------------------------------

/**
 * Redistribute everything still pending from today onward.
 *
 * Called when a learner falls behind. Overdue work is not dropped and the
 * target date is not moved — the remaining items are re-laid across the days
 * that actually remain, respecting the same daily capacity. Zero tokens.
 */
export async function replan(planId: string, userId: string): Promise<{ moved: number; days: number }> {
  const db = admin();
  const plan = must(await db.from('plans').select('*').eq('id', planId).eq('user_id', userId).single(), 'replanLoad');
  const today = todayIso();

  const pending = must(
    await db
      .from('session_items')
      .select('id, est_minutes, sessions!inner(scheduled_on, day_index)')
      .eq('plan_id', planId)
      .eq('status', 'pending')
      .order('idx', { ascending: true }),
    'replanPending',
  ) as unknown as Array<{ id: string; est_minutes: number; sessions: { scheduled_on: string; day_index: number } }>;

  const future = must(
    await db
      .from('sessions')
      .select('id, day_index, scheduled_on, planned_minutes')
      .eq('plan_id', planId)
      .gte('scheduled_on', today)
      .order('day_index', { ascending: true }),
    'replanSessions',
  ) as unknown as Array<{ id: string; day_index: number; scheduled_on: string; planned_minutes: number }>;

  if (!future.length) return { moved: 0, days: 0 };

  // Keep items already scheduled in the future where they are; only overdue moves.
  const overdue = pending.filter((p) => p.sessions.scheduled_on < today);
  if (!overdue.length) return { moved: 0, days: future.length };

  const capacityFor = (iso: string) => {
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
    return dow === 0 || dow === 6 ? plan.weekend_minutes : plan.weekday_minutes;
  };

  const load = new Map(future.map((s) => [s.id, s.planned_minutes]));
  const updates: Array<{ id: string; session_id: string }> = [];
  let cursor = 0;

  for (const item of overdue) {
    // Allow a 25% overflow before spilling to the next day, so catch-up is
    // dense rather than smeared thinly across the whole remaining plan.
    while (cursor < future.length) {
      const day = future[cursor];
      const cap = capacityFor(day.scheduled_on) * 1.25;
      if ((load.get(day.id) ?? 0) + item.est_minutes <= cap) break;
      cursor++;
    }
    const target = future[Math.min(cursor, future.length - 1)];
    load.set(target.id, (load.get(target.id) ?? 0) + item.est_minutes);
    updates.push({ id: item.id, session_id: target.id });
  }

  for (const chunk of chunked(updates, 200)) {
    await Promise.all(
      chunk.map((u) => db.from('session_items').update({ session_id: u.session_id }).eq('id', u.id)),
    );
  }

  // Refresh denormalised per-day totals.
  await Promise.all(
    future.map((s) => db.from('sessions').update({ planned_minutes: Math.round(load.get(s.id) ?? 0) }).eq('id', s.id)),
  );

  await event(planId, userId, 'replan', 'ok', `Rescheduled ${updates.length} overdue items`, { days: future.length });
  return { moved: updates.length, days: future.length };
}

function* chunked<T>(items: T[], size: number): Generator<T[]> {
  for (let i = 0; i < items.length; i += size) yield items.slice(i, i + size);
}
