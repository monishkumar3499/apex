import { createHash } from 'crypto';
import { admin, must } from '../db/supabase';
import { runJson, TokenLedger } from '../ai/model-router';
import { INTAKE_SYSTEM, INTAKE_SCHEMA_HINT, intakeUser, type IntakeResult } from '../prompts/intake';
import {
  normalizeBlueprint,
  BLUEPRINT_VERSION,
  TOPIC_MIN_MINUTES,
  TOPIC_MAX_MINUTES,
  type BlueprintResult,
} from '../prompts/blueprint';
import { generateBlueprint } from './blueprint-builder';
import { welcomeMessage } from '../prompts/coach';
import { curateResources, startSubjectDiscovery } from '../curation/curate';
import { buildSchedule, type SchedTopic } from '../planner/scheduler';
import { diffDays, todayIso } from '../planner/calendar';
import { buildDigest } from './digest';
import { slugify } from '../curation/text';
import { logger } from '../logger/pino';

/**
 * Plan build orchestration.
 *
 * Model calls, regardless of plan size:
 *   1. classify   nano tier, ~400 tokens
 *   2. blueprint  structured tier — an outline call plus 2-3 concurrent topic
 *                 calls (see blueprint-builder). Skipped on a cache hit.
 *
 * Everything else — resource discovery, scheduling, the digest, the welcome
 * message — is code, and costs nothing.
 *
 * The stages are ordered for wall-clock, not for readability: subject-level
 * resource discovery starts before the structure call, and curation runs
 * alongside the database writes, because neither depends on the other.
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
  /** Whose request this is, so the provider gate can round-robin between learners. */
  owner?: string;
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
      owner: params.owner,
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
 * Anchored to real study capacity, not to a fixed number.
 *
 * The divisor sets the average topic size, and that single number decides
 * whether the plan feels usable. At one topic per 2.5 hours the average entry
 * was a 150-minute block — three evenings of the same title, which reads to a
 * learner as a plan that has stalled and to the scheduler as "Topic 4 — part
 * 3". At 1.75 the average lands near 105 minutes and, with the prompt's
 * 120-minute ceiling, most topics come out at one or two sittings: small
 * enough to finish, which is what keeps someone returning.
 *
 * More topics costs blueprint output tokens, and output tokens are serial.
 * That is paid for twice over: Gemini's thinking budget is off, and generation
 * is sharded across concurrent calls rather than emitted in one response.
 */
export function sizePlan(studyHours: number): { topicTarget: number; unitTarget: number } {
  const topicTarget = Math.max(12, Math.min(80, Math.round(studyHours / 1.75)));
  // Six topics per unit keeps a unit reviewable in one checkpoint sitting.
  const unitTarget = Math.max(3, Math.min(12, Math.round(topicTarget / 6)));
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
    // BLUEPRINT_VERSION is in the key so a change to the prompt invalidates the
    // cache: otherwise returning learners keep getting the old structure.
    .update([BLUEPRINT_VERSION, slug, prepType, level, Math.round(hours / 25) * 25].join('|'))
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

    // ---- Latency: start what does not depend on the model ---------------
    //
    // The playlist sweep and the two subject-level web searches need only the
    // subject and the prep type, both known already. Firing them here means
    // they run *underneath* the structure call instead of after it, which takes
    // several seconds off the wall-clock time a learner spends watching the
    // build screen. Nothing awaits them until curation.
    const discovery = startSubjectDiscovery({ subject, prepType: plan.prep_type });

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
      // Generated as an outline plus concurrent per-slice topic calls. One
      // combined call for this much structure measured at 33 seconds against
      // the live API, and it is the longest thing a learner waits on.
      const generation = await generateBlueprint({
        // Every model call in this build queues under the learner who started
        // it, so a six-month plan cannot starve nineteen other people.
        owner: userId,
        req: {
          subject,
          prepType: plan.prep_type,
          scope: intake.scope ?? `Working competence in ${subject}`,
          level: plan.skill_level,
          weeks,
          studyHours,
          topicTarget,
          unitTarget,
          extras: (plan.intake ?? {}) as Record<string, string>,
        },
        ledger,
        onProgress: (message, meta) => event(planId, userId, 'structure', 'running', message, meta ?? {}),
      });

      blueprint = generation.blueprint;

      // A partially degraded structure is still cacheable — but say so, rather
      // than letting the next learner inherit a gap silently.
      if (generation.degradedUnits.length) {
        await event(
          planId,
          userId,
          'structure',
          'warn',
          `${generation.degradedUnits.length} unit(s) could not be detailed and were left out`,
          { units: generation.degradedUnits.slice(0, 8) },
        );
      }

      if (blueprint.u.length) {
        await db.from('blueprint_cache').upsert({ cache_key: key, payload: blueprint as any, hits: 1 });
      }
      await event(planId, userId, 'structure', 'ok', `Mapped ${blueprint.u.length} units`, {
        sharded: generation.sharded,
      });
    }

    const units = (blueprint.u ?? []).filter((u) => u?.t && Array.isArray(u.tp) && u.tp.length);
    if (!units.length) throw new Error('The model returned no usable structure for this goal');

    // ---- Shape the topics (no database involved yet) --------------------
    let topicOrdinal = 0;
    const topicRows = units.flatMap((u, unitIdx) =>
      u.tp.filter((t) => t?.t).map((t) => {
        const idx = topicOrdinal++;
        return {
          plan_id: planId,
          user_id: userId,
          idx,
          title: String(t.t).slice(0, 200),
          summary: t.s ? String(t.s).slice(0, 600) : null,
          outcomes: (t.o ?? []).slice(0, 4).map((o) => String(o).slice(0, 200)),
          keywords: (t.k ?? []).slice(0, 8).map((k) => String(k).toLowerCase().slice(0, 60)),
          // Bounded by the same limits the prompt states, so a model that
          // ignores them cannot produce a five-block monolith of one title.
          est_minutes: Math.max(TOPIC_MIN_MINUTES, Math.min(TOPIC_MAX_MINUTES, Number(t.m) || 60)),
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

    // ---- Stage 3 · resource curation (no model involved) ----------------
    //
    // Started *before* the inserts, because curation depends only on the
    // blueprint — titles, keywords and unit membership — and not on a single
    // database id. It used to run after two sequential round trips that it had
    // no need to wait for.
    await event(planId, userId, 'resources', 'running', 'Finding and ranking real study material');

    const curationPromise = curateResources({
      subject,
      prepType: plan.prep_type,
      discovery,
      // Budgets follow plan size. Fixed ones meant a ten-unit plan got searches
      // for seven of its units and a gap pass for eight of its sixty-five
      // topics — measured coverage was 28/65. YouTube search.list costs 100
      // quota units of a 10,000/day allowance, so this stays inside roughly
      // 2,500 units for the largest plans.
      videoSearchBudget: Math.min(14, units.length + 2),
      webSearchBudget: Math.min(8, units.length),
      gapSearchBudget: Math.min(12, Math.max(6, Math.round(topicRows.length / 4))),
      units: units.map((u, i) => ({ idx: i, title: String(u.t), queries: (u.q ?? []).map(String) })),
      topics: topicRows.map((t) => ({
        idx: t.idx,
        title: t.title,
        summary: t.summary ?? undefined,
        keywords: t.keywords,
        unitIdx: t._unitIdx,
      })),
    });
    // Claim the rejection now: if an insert below throws first, an unobserved
    // rejection here would take the process down instead of failing the build.
    curationPromise.catch(() => undefined);

    // ---- Persist units & topics (concurrent with curation) --------------
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

    const savedTopics = must(
      await db
        .from('topics')
        .insert(topicRows.map(({ _unitIdx, ...row }) => ({ ...row, unit_id: unitIdById.get(_unitIdx) })))
        .select('id, idx'),
      'insertTopics',
    );
    const topicIdByIdx = new Map(savedTopics.map((t: any) => [t.idx, t.id]));

    await event(planId, userId, 'topics', 'ok', `${topicRows.length} topics structured`);

    const curation = await curationPromise;

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
      // The video count is the number a learner actually feels, so it is in the
      // message rather than only in the meta payload.
      `${curation.resources.length} verified resources · ${curation.stats.withVideo}/${topicRows.length} topics have something to watch`,
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
    //
    // The chunks go out together rather than one after another. They are
    // independent inserts into the same table, so serialising them made a
    // 2,000-item plan pay four sequential round trips for no ordering benefit.
    // `.select('id')` is dropped: the ids are never read, and returning 500
    // rows per chunk is pure transfer cost.
    const itemChunks: Array<typeof itemRows> = [];
    for (let i = 0; i < itemRows.length; i += 500) itemChunks.push(itemRows.slice(i, i + 500));

    // Mocks are independent of the items, so they ride along in the same batch.
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

    const writes = await Promise.all([
      ...itemChunks.map((chunk) => db.from('session_items').insert(chunk)),
      ...(mockRows.length ? [db.from('mocks').insert(mockRows)] : []),
    ]);
    // A failed chunk must still fail the build — a plan missing a quarter of
    // its days is worse than a plan that reports it could not be built.
    writes.forEach((result, i) => must({ data: result.data ?? [], error: result.error }, `insertItems[${i}]`));

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
