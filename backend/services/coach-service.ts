import { admin } from '../db/supabase';
import { COACH_SYSTEM, coachContext } from '../prompts/coach';
import { todayIso, diffDays } from '../planner/calendar';
import { similarity, keywordCoverage } from '../curation/text';
import type { Message } from '../ai/model-router';

/**
 * Coach context assembly.
 *
 * The whole point of this module is what it *doesn't* send. The plan digest is
 * pre-computed and static; today's items are a handful of lines; and instead of
 * shipping the full topic list we retrieve only the three topics whose keywords
 * actually match the question. Typical turn: ~900 prompt tokens against the
 * ~3,400 the previous design sent every time.
 */

const HISTORY_TURNS = 6;
const RETRIEVED_TOPICS = 3;
/**
 * How many of the learner's own resources to put in front of the model.
 *
 * The prompt asks for two or three links, so shipping ten only invites it to
 * pick the least relevant ones — and every line here is prompt tokens on every
 * single turn.
 */
const RETRIEVED_RESOURCES = 6;

export interface CoachTurn {
  messages: Message[];
  chatId: string;
  estimatedPromptTokens: number;
}

export async function buildCoachTurn(params: {
  planId: string;
  userId: string;
  question: string;
}): Promise<CoachTurn> {
  const db = admin();
  const today = todayIso();

  const [{ data: plan }, { data: chat }] = await Promise.all([
    db
      .from('plans')
      .select('id, title, digest, start_date, target_date, total_items, done_items, skill_level, prep_type')
      .eq('id', params.planId)
      .eq('user_id', params.userId)
      .single(),
    db
      .from('chats')
      .select('id')
      .eq('plan_id', params.planId)
      .eq('user_id', params.userId)
      .single(),
  ]);

  if (!plan) throw new Error('Plan not found');
  if (!chat) throw new Error('Chat is not ready for this plan yet');

  const [{ data: todaySession }, { data: topics }, { data: history }] = await Promise.all([
    db
      .from('sessions')
      .select('day_index, headline, session_items(title, kind, status, est_minutes)')
      .eq('plan_id', params.planId)
      .eq('scheduled_on', today)
      .maybeSingle(),
    db
      .from('topics')
      // `id` is new: the retrieved topics' ids are what the resource lookup
      // below keys on, so the coach can link the learner's own material.
      .select('id, title, summary, outcomes, keywords, mastery, idx')
      .eq('plan_id', params.planId),
    db
      .from('messages')
      .select('role, content')
      .eq('chat_id', chat.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_TURNS),
  ]);

  // ---- Progress line ------------------------------------------------------
  const elapsed = Math.max(0, diffDays(plan.start_date, today));
  const total = Math.max(1, diffDays(plan.start_date, plan.target_date));
  const donePct = plan.total_items ? Math.round((plan.done_items / plan.total_items) * 100) : 0;
  const expectedPct = Math.round((elapsed / total) * 100);
  const drift = donePct - expectedPct;

  const progressLine = [
    `${plan.done_items}/${plan.total_items} items complete (${donePct}%)`,
    `day ${elapsed} of ${total}, expected ~${expectedPct}%`,
    drift < -12 ? `BEHIND by ${Math.abs(drift)} points` : drift > 12 ? `AHEAD by ${drift} points` : 'on pace',
  ].join(' · ');

  // ---- Today --------------------------------------------------------------
  const items = (todaySession?.session_items ?? []) as Array<{
    title: string; kind: string; status: string; est_minutes: number;
  }>;
  const todayLine = items.length
    ? items
        .map((i) => `${i.status === 'done' ? '[x]' : '[ ]'} ${i.kind}: ${i.title} (${i.est_minutes}m)`)
        .join('\n')
    : 'No session scheduled for today.';

  // ---- Retrieval ----------------------------------------------------------
  type TopicRow = {
    id: string;
    title: string;
    summary: string | null;
    outcomes: string[] | null;
    keywords: string[] | null;
    mastery: number;
  };

  const scored = ((topics ?? []) as unknown as TopicRow[])
    .map((t) => ({
      topic: t,
      score:
        similarity(params.question, `${t.title} ${t.summary ?? ''}`) * 0.6 +
        keywordCoverage(t.keywords ?? [], params.question) * 0.4,
    }))
    .filter((s) => s.score > 0.04)
    .sort((a, b) => b.score - a.score)
    .slice(0, RETRIEVED_TOPICS);

  const relevantTopics = scored.length
    ? scored
        .map(({ topic }) =>
          [
            `• ${topic.title} (mastery ${topic.mastery}%)`,
            topic.summary ? `  ${topic.summary}` : '',
            topic.outcomes?.length ? `  Outcomes: ${topic.outcomes.join('; ')}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n')
    : 'No plan topic closely matches this question.';

  /*
    ---- The learner's own library, for the retrieved topics ----------------

    The coach could always *describe* a resource but had no way to link one, so
    answers ended in "look it up" while the plan already held a ranked, verified
    video for exactly that topic.

    One query, scoped to at most three topic ids. Videos first, because that is
    the order the prompt is told to cite in and the order learners reach for.

    Injecting the list rather than trusting recall is also what makes the
    citations safe: the model has no URL to hallucinate from, and the prompt
    forbids any link not in this block.
  */
  const topicIds = scored.map(({ topic }) => topic.id);

  const { data: resourceLinks } = topicIds.length
    ? await db
        .from('topic_resources')
        .select('topic_id, rank, resources ( kind, title, url, author, duration_sec )')
        .eq('plan_id', params.planId)
        .in('topic_id', topicIds)
        .order('rank', { ascending: true })
    : { data: [] };

  const titleById = new Map(scored.map(({ topic }) => [topic.id, topic.title]));

  const resourceLines = ((resourceLinks ?? []) as any[])
    .filter((link) => link.resources?.url)
    .map((link) => {
      const r = link.resources;
      const watchable = r.kind === 'video' || r.kind === 'playlist';
      const minutes = r.duration_sec ? ` ${Math.round(r.duration_sec / 60)}m` : '';
      return {
        watchable,
        line: [
          `• [${r.kind}${minutes}] ${r.title}${r.author ? ` — ${r.author}` : ''}`,
          `  ${r.url}`,
          `  for: ${titleById.get(link.topic_id) ?? 'this plan'}`,
        ].join('\n'),
      };
    })
    .sort((a, b) => Number(b.watchable) - Number(a.watchable))
    .slice(0, RETRIEVED_RESOURCES)
    .map((r) => r.line);

  const resources = resourceLines.length
    ? resourceLines.join('\n')
    : 'Nothing in the library matches these topics.';

  // ---- Assemble -----------------------------------------------------------
  const context = coachContext({
    digest: plan.digest ?? plan.title,
    todayLine,
    relevantTopics,
    progressLine,
    resources,
  });

  const messages: Message[] = [
    { role: 'system', content: COACH_SYSTEM },
    { role: 'system', content: context },
    ...((history ?? []) as unknown as Array<{ role: string; content: string }>)
      .slice()
      .reverse()
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    { role: 'user', content: params.question },
  ];

  const estimatedPromptTokens = Math.ceil(
    messages.reduce((sum, m) => sum + m.content.length, 0) / 4,
  );

  return { messages, chatId: chat.id, estimatedPromptTokens };
}
