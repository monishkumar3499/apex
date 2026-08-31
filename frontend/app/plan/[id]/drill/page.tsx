import { redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/supabase/server';
import { admin } from '../../../../../backend/db/supabase';
import { todayIso } from '../../../../../backend/planner/calendar';
import { DrillView, type DrillTopic } from '../../../../components/drill-view';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ topic?: string }> };

export default async function DrillPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { topic } = await searchParams;

  const user = await currentUser();
  if (!user) redirect(`/login?next=/plan/${id}/drill`);

  const db = admin();
  const today = todayIso();

  const [{ data: topics }, { data: taught }, { count: dueCount }, { data: questionRows }] = await Promise.all([
    db.from('topics').select('id, idx, title, mastery, unit_id').eq('plan_id', id).order('idx'),
    db
      .from('session_items')
      .select('topic_id')
      .eq('plan_id', id)
      .eq('kind', 'learn')
      .eq('status', 'done')
      .not('topic_id', 'is', null),
    db
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('plan_id', id)
      .eq('user_id', user.id)
      .lte('due_on', today),
    db.from('questions').select('topic_id').eq('plan_id', id).eq('user_id', user.id),
  ]);

  const taughtIds = new Set((taught ?? []).map((t: any) => t.topic_id as string));

  const questionCounts = new Map<string, number>();
  for (const row of (questionRows ?? []) as Array<{ topic_id: string }>) {
    questionCounts.set(row.topic_id, (questionCounts.get(row.topic_id) ?? 0) + 1);
  }

  const list: DrillTopic[] = (topics ?? []).map((t: any) => ({
    id: t.id,
    title: t.title,
    mastery: t.mastery,
    taught: taughtIds.has(t.id),
    questionCount: questionCounts.get(t.id) ?? 0,
  }));

  return <DrillView planId={id} topics={list} dueCount={dueCount ?? 0} initialTopic={topic ?? null} />;
}
