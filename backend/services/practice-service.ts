import { admin, must } from '../db/supabase';
import { runJson } from '../ai/model-router';
import {
  PRACTICE_SYSTEM,
  PRACTICE_SCHEMA_HINT,
  practiceUser,
  type PracticeResult,
} from '../prompts/practice';
import { schedule as sm2, INITIAL_REVIEW, GRADE_FROM_BUTTON, masteryFrom, type GradeButton } from '../planner/spaced';
import { todayIso } from '../planner/calendar';
import { logger } from '../logger/pino';

/**
 * The drill engine.
 *
 * Questions are generated per topic on first use and then reused forever, so
 * the model cost is paid once per topic a learner actually studies — not
 * up-front for 40 topics they may never reach.
 */

const DEFAULT_COUNT = 8;

export async function ensureQuestions(params: {
  planId: string;
  topicId: string;
  userId: string;
  count?: number;
}): Promise<{ generated: number; total: number }> {
  const db = admin();
  const count = params.count ?? DEFAULT_COUNT;

  const existing = must(
    await db
      .from('questions')
      .select('id', { count: 'exact' })
      .eq('topic_id', params.topicId)
      .eq('user_id', params.userId),
    'countQuestions',
  ) as Array<{ id: string }>;

  if (existing.length >= count) return { generated: 0, total: existing.length };

  const topic = must(
    await db
      .from('topics')
      .select('title, summary, outcomes, plan_id, plans!inner(title, skill_level, prep_type, intake)')
      .eq('id', params.topicId)
      .eq('user_id', params.userId)
      .single(),
    'loadTopicForDrill',
  ) as any;

  const subject = topic.plans?.intake?.subject ?? topic.plans?.title ?? '';
  const needed = count - existing.length;

  let result: PracticeResult;
  try {
    result = await runJson<PracticeResult>({
      tier: 'structured',
      label: 'practice',
      temperature: 0.55,
      // Headroom for reasoning models, whose thinking shares this budget.
      maxTokens: 8000,
      reasoning: { effort: 'low' },
      schemaHint: PRACTICE_SCHEMA_HINT,
      owner: params.userId,
      messages: [
        { role: 'system', content: PRACTICE_SYSTEM },
        {
          role: 'user',
          content: practiceUser({
            subject,
            topic: topic.title,
            summary: topic.summary ?? undefined,
            outcomes: topic.outcomes ?? [],
            level: topic.plans?.skill_level ?? 'beginner',
            count: needed,
            prepType: topic.plans?.prep_type ?? 'skill',
          }),
        },
      ],
    });
  } catch (error) {
    logger.error({ error, topicId: params.topicId }, 'question generation failed');
    return { generated: 0, total: existing.length };
  }

  const rows = (result.q ?? [])
    .filter((q) => q?.s && q?.a)
    .map((q) => {
      const kind = ['mcq', 'short', 'flash'].includes(q.k) ? q.k : 'mcq';
      let options = Array.isArray(q.o) ? q.o.map(String).slice(0, 6) : [];
      let answer = String(q.a);

      // An MCQ whose answer isn't among its options is unusable — demote it
      // to a short-answer question rather than shipping a broken card.
      if (kind === 'mcq' && !options.includes(answer)) {
        if (options.length >= 2) options = [...options.slice(0, 3), answer];
        else return { ...q, _kind: 'short' as const, options: [], answer };
      }

      return { ...q, _kind: kind as 'mcq' | 'short' | 'flash', options, answer };
    })
    .map((q) => ({
      plan_id: params.planId,
      topic_id: params.topicId,
      user_id: params.userId,
      kind: q._kind,
      stem: String(q.s).slice(0, 1200),
      options: q._kind === 'mcq' ? q.options : [],
      answer: String(q.answer).slice(0, 600),
      explanation: q.e ? String(q.e).slice(0, 900) : null,
      difficulty: Math.max(1, Math.min(5, Number(q.d) || 3)),
    }));

  if (!rows.length) return { generated: 0, total: existing.length };

  must(await db.from('questions').insert(rows).select('id'), 'insertQuestions');
  return { generated: rows.length, total: existing.length + rows.length };
}

/**
 * The drill queue: cards due for review first, then unseen cards from topics
 * already taught. Review always outranks new material — that is the whole
 * point of spaced repetition.
 */
export async function drillQueue(params: {
  planId: string;
  userId: string;
  topicId?: string;
  limit?: number;
}) {
  const db = admin();
  const limit = params.limit ?? 15;
  const today = todayIso();

  let dueQuery = db
    .from('reviews')
    .select('question_id, questions!inner(id, topic_id, kind, stem, options, answer, explanation, difficulty)')
    .eq('user_id', params.userId)
    .eq('plan_id', params.planId)
    .lte('due_on', today)
    .order('due_on', { ascending: true })
    .limit(limit);

  if (params.topicId) dueQuery = dueQuery.eq('topic_id', params.topicId);
  const { data: due } = await dueQuery;

  const dueCards = (due ?? []).map((r: any) => ({ ...r.questions, isReview: true }));
  const remaining = limit - dueCards.length;
  if (remaining <= 0) return dueCards.slice(0, limit);

  // Unseen cards. Restricted to topics whose material has actually been
  // taught, so a learner is never quizzed on something not yet studied.
  const { data: taught } = await db
    .from('session_items')
    .select('topic_id')
    .eq('plan_id', params.planId)
    .eq('user_id', params.userId)
    .eq('kind', 'learn')
    .eq('status', 'done')
    .not('topic_id', 'is', null);

  const taughtIds = [...new Set((taught ?? []).map((t: any) => t.topic_id))];
  const scope = params.topicId ? [params.topicId] : taughtIds;
  if (!scope.length) return dueCards;

  const { data: seen } = await db
    .from('reviews')
    .select('question_id')
    .eq('user_id', params.userId)
    .eq('plan_id', params.planId);
  const seenIds = new Set((seen ?? []).map((s: any) => s.question_id));

  const { data: fresh } = await db
    .from('questions')
    .select('id, topic_id, kind, stem, options, answer, explanation, difficulty')
    .eq('plan_id', params.planId)
    .eq('user_id', params.userId)
    .in('topic_id', scope)
    .limit(remaining + seenIds.size);

  const newCards = (fresh ?? [])
    .filter((q: any) => !seenIds.has(q.id))
    .slice(0, remaining)
    .map((q: any) => ({ ...q, isReview: false }));

  return [...dueCards, ...newCards];
}

/** Record an answer, advance the SM-2 state, and refresh topic mastery. */
export async function gradeAnswer(params: {
  planId: string;
  userId: string;
  questionId: string;
  button: GradeButton;
}) {
  const db = admin();
  const grade = GRADE_FROM_BUTTON[params.button] ?? 3;

  const question = must(
    await db
      .from('questions')
      .select('id, topic_id, plan_id')
      .eq('id', params.questionId)
      .eq('user_id', params.userId)
      .single(),
    'loadQuestion',
  );

  const { data: existing } = await db
    .from('reviews')
    .select('*')
    .eq('question_id', params.questionId)
    .eq('user_id', params.userId)
    .maybeSingle();

  const state = existing
    ? {
        ease: Number(existing.ease),
        intervalDays: existing.interval_days,
        repetitions: existing.repetitions,
        lapses: existing.lapses,
      }
    : INITIAL_REVIEW;

  const next = sm2(state, grade);
  const dueOn = new Date(Date.now() + next.dueInDays * 86_400_000).toISOString().slice(0, 10);

  await db.from('reviews').upsert(
    {
      question_id: params.questionId,
      user_id: params.userId,
      plan_id: question.plan_id,
      topic_id: question.topic_id,
      ease: next.ease,
      interval_days: next.intervalDays,
      repetitions: next.repetitions,
      lapses: next.lapses,
      due_on: dueOn,
      last_grade: grade,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'question_id,user_id' },
  );

  // Recompute mastery for the topic from all of its review states.
  const { data: topicReviews } = await db
    .from('reviews')
    .select('ease, interval_days, repetitions, lapses, last_grade')
    .eq('user_id', params.userId)
    .eq('topic_id', question.topic_id);

  const reviews = (topicReviews ?? []).map((r: any) => ({
    ease: Number(r.ease),
    intervalDays: r.interval_days,
    repetitions: r.repetitions,
    lapses: r.lapses,
  }));
  const correct = (topicReviews ?? []).filter((r: any) => (r.last_grade ?? 0) >= 3).length;
  const accuracy = topicReviews?.length ? correct / topicReviews.length : 0;

  const mastery = masteryFrom(reviews, accuracy);
  await db.from('topics').update({ mastery }).eq('id', question.topic_id);

  return { dueInDays: next.dueInDays, ease: Number(next.ease.toFixed(2)), mastery, correct: grade >= 3 };
}

/** Log a completed drill run so streaks include practice, not just sessions. */
export async function logDrill(params: { planId: string; userId: string; minutes: number; cards: number }) {
  const db = admin();
  const today = todayIso();

  const { data: log } = await db
    .from('study_logs')
    .select('id, minutes, items_done')
    .eq('user_id', params.userId)
    .eq('plan_id', params.planId)
    .eq('logged_on', today)
    .eq('source', 'drill')
    .maybeSingle();

  if (log) {
    await db
      .from('study_logs')
      .update({ minutes: log.minutes + params.minutes, items_done: log.items_done + params.cards })
      .eq('id', log.id);
  } else {
    await db.from('study_logs').insert({
      user_id: params.userId,
      plan_id: params.planId,
      logged_on: today,
      minutes: params.minutes,
      items_done: params.cards,
      source: 'drill',
    });
  }
}
