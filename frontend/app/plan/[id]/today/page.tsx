import { redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/supabase/server';
import { admin } from '../../../../../backend/db/supabase';
import { todayIso, diffDays } from '../../../../../backend/planner/calendar';
import { TodayBoard, type SessionItem } from '../../../../components/today-board';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

const ITEM_SELECT = `
  id, idx, kind, title, detail, est_minutes, status,
  topics ( id, title, mastery ),
  resources ( id, kind, title, url, author, thumbnail_url, duration_sec, why )
`;

export default async function TodayPage({ params }: Props) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/plan/${id}/today`);

  const db = admin();
  const today = todayIso();

  const { data: plan } = await db
    .from('plans')
    .select('id, title, start_date, target_date, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!plan) redirect('/app');

  if (plan.status === 'building' || plan.status === 'failed') {
    redirect(`/plan/${id}/building`);
  }

  // Today's session, or the next one if today is a rest day.
  const { data: session } = await db
    .from('sessions')
    .select(`id, day_index, scheduled_on, planned_minutes, headline, session_items ( ${ITEM_SELECT} )`)
    .eq('plan_id', id)
    .eq('scheduled_on', today)
    .maybeSingle();

  const { data: upcoming } = session
    ? { data: null }
    : await db
        .from('sessions')
        .select(`id, day_index, scheduled_on, planned_minutes, headline, session_items ( ${ITEM_SELECT} )`)
        .eq('plan_id', id)
        .gt('scheduled_on', today)
        .order('scheduled_on', { ascending: true })
        .limit(1)
        .maybeSingle();

  const active = session ?? upcoming;

  // Anything still pending from a day that has already passed.
  const { data: overdue } = await db
    .from('session_items')
    .select('id, title, kind, est_minutes, sessions!inner(scheduled_on)')
    .eq('plan_id', id)
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .lt('sessions.scheduled_on', today)
    .order('idx', { ascending: true })
    .limit(50);

  const { count: totalDays } = await db
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', id);

  const items = ((active?.session_items ?? []) as unknown as SessionItem[])
    .slice()
    .sort((a, b) => a.idx - b.idx);

  /*
    Everything else attached to today's topics, beyond the one resource the
    scheduler pinned to each item.

    A `learn` item opens with its single best-matched resource, which is often a
    doc — so the topic's video was reachable only from the Library, two
    navigations away from the screen the learner is actually on. One extra query
    keyed on the topics already loaded fixes that.
  */
  const topicIds = [...new Set(items.map((i) => i.topics?.id).filter(Boolean))] as string[];

  const { data: topicLinks } = topicIds.length
    ? await db
        .from('topic_resources')
        .select('topic_id, rank, resources ( id, kind, title, url, author, thumbnail_url, duration_sec, why )')
        .eq('plan_id', id)
        .in('topic_id', topicIds)
        .order('rank', { ascending: true })
    : { data: [] };

  const extrasByTopic: Record<string, SessionItem['resources'][]> = {};
  for (const link of (topicLinks ?? []) as any[]) {
    if (!link.resources) continue;
    (extrasByTopic[link.topic_id] ??= []).push(link.resources);
  }

  return (
    <TodayBoard
      planId={id}
      dayIndex={active?.day_index ?? 0}
      totalDays={totalDays ?? 0}
      scheduledOn={active?.scheduled_on ?? today}
      isToday={Boolean(session)}
      headline={active?.headline ?? null}
      plannedMinutes={active?.planned_minutes ?? 0}
      items={items}
      topicResources={extrasByTopic}
      overdue={(overdue ?? []).map((o: any) => ({
        id: o.id,
        title: o.title,
        kind: o.kind,
        estMinutes: o.est_minutes,
        scheduledOn: o.sessions.scheduled_on,
      }))}
      daysLeft={Math.max(0, diffDays(today, plan.target_date))}
    />
  );
}
