import { redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/supabase/server';
import { admin } from '../../../../../backend/db/supabase';
import { PlanMap, type MapUnit } from '../../../../components/plan-map';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function MapPage({ params }: Props) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/plan/${id}/map`);

  const db = admin();

  const [{ data: units }, { data: topics }, { data: items }, { data: mocks }] = await Promise.all([
    db.from('units').select('id, idx, title, summary, weight').eq('plan_id', id).order('idx'),
    db
      .from('topics')
      .select('id, unit_id, idx, title, summary, outcomes, est_minutes, difficulty, mastery')
      .eq('plan_id', id)
      .order('idx'),
    db
      .from('session_items')
      .select('topic_id, status, kind, sessions!inner(day_index, scheduled_on)')
      .eq('plan_id', id)
      .not('topic_id', 'is', null),
    db.from('mocks').select('id, title, scheduled_on, duration_min').eq('plan_id', id).order('scheduled_on'),
  ]);

  // Roll item state up to each topic: how much is done and when it is scheduled.
  const stats = new Map<string, { done: number; total: number; firstDay: number; lastDay: number; firstDate: string }>();
  for (const item of (items ?? []) as any[]) {
    const key = item.topic_id as string;
    const day = item.sessions.day_index as number;
    const entry = stats.get(key) ?? {
      done: 0, total: 0, firstDay: day, lastDay: day, firstDate: item.sessions.scheduled_on,
    };
    entry.total++;
    if (item.status === 'done') entry.done++;
    if (day < entry.firstDay) { entry.firstDay = day; entry.firstDate = item.sessions.scheduled_on; }
    if (day > entry.lastDay) entry.lastDay = day;
    stats.set(key, entry);
  }

  const { count: resourceCounts } = { count: null };
  const { data: links } = await db
    .from('topic_resources')
    .select('topic_id')
    .eq('plan_id', id);

  const resourcesPerTopic = new Map<string, number>();
  for (const link of (links ?? []) as Array<{ topic_id: string }>) {
    resourcesPerTopic.set(link.topic_id, (resourcesPerTopic.get(link.topic_id) ?? 0) + 1);
  }
  void resourceCounts;

  const mapUnits: MapUnit[] = (units ?? []).map((unit: any) => {
    const unitTopics = (topics ?? [])
      .filter((t: any) => t.unit_id === unit.id)
      .map((t: any) => {
        const s = stats.get(t.id);
        return {
          id: t.id,
          idx: t.idx,
          title: t.title,
          summary: t.summary,
          outcomes: t.outcomes ?? [],
          estMinutes: t.est_minutes,
          difficulty: t.difficulty,
          mastery: t.mastery,
          done: s?.done ?? 0,
          total: s?.total ?? 0,
          firstDay: s?.firstDay ?? null,
          firstDate: s?.firstDate ?? null,
          resourceCount: resourcesPerTopic.get(t.id) ?? 0,
          scheduled: Boolean(s),
        };
      });

    return {
      id: unit.id,
      idx: unit.idx,
      title: unit.title,
      summary: unit.summary,
      weight: Number(unit.weight),
      topics: unitTopics,
    };
  });

  return (
    <PlanMap
      planId={id}
      units={mapUnits}
      mocks={(mocks ?? []).map((m: any) => ({
        id: m.id,
        title: m.title,
        scheduledOn: m.scheduled_on,
        durationMin: m.duration_min,
      }))}
    />
  );
}
