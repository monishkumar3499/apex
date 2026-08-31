import { admin } from '../db/supabase';
import { todayIso, diffDays, addDays } from '../planner/calendar';

/**
 * Progress analytics.
 *
 * Every figure is derived from logged completions rather than from planned
 * minutes, so "you are 18% behind" is a fact about what the learner did, not
 * about what the plan hoped for.
 */

export interface ProgressSnapshot {
  donePct: number;
  expectedPct: number;
  drift: number;                 // positive = ahead of schedule
  status: 'ahead' | 'on-track' | 'slipping' | 'behind';
  streak: number;
  longestStreak: number;
  minutesTotal: number;
  minutesLast7: number;
  dailyAverage: number;
  daysElapsed: number;
  daysTotal: number;
  daysLeft: number;
  overdueItems: number;
  /** Minutes/day required from here to finish on time. */
  requiredPace: number;
  projectedFinish: string | null;
  heatmap: Array<{ date: string; minutes: number }>;
  byKind: Array<{ kind: string; done: number; total: number }>;
  units: Array<{ title: string; mastery: number; done: number; total: number }>;
  weakTopics: Array<{ id: string; title: string; mastery: number }>;
}

const HEATMAP_DAYS = 91;

function streaks(dates: Set<string>, today: string): { current: number; longest: number } {
  let current = 0;
  // A streak survives "not yet studied today" — it breaks only after a missed
  // full day, otherwise every morning would show a reset to zero.
  let cursor = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(cursor)) {
    current++;
    cursor = addDays(cursor, -1);
  }

  let longest = 0;
  let run = 0;
  const sorted = [...dates].sort();
  let previous: string | null = null;
  for (const date of sorted) {
    run = previous && diffDays(previous, date) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  return { current, longest };
}

export async function getProgress(planId: string, userId: string): Promise<ProgressSnapshot> {
  const db = admin();
  const today = todayIso();

  const { data: plan } = await db
    .from('plans')
    .select('id, start_date, target_date, total_items, done_items, weekday_minutes, weekend_minutes')
    .eq('id', planId)
    .eq('user_id', userId)
    .single();

  if (!plan) throw new Error('Plan not found');

  const [{ data: logs }, { data: items }, { data: units }, { data: topics }] = await Promise.all([
    db
      .from('study_logs')
      .select('logged_on, minutes')
      .eq('plan_id', planId)
      .eq('user_id', userId)
      .gte('logged_on', addDays(today, -HEATMAP_DAYS)),
    db
      .from('session_items')
      .select('kind, status, est_minutes, sessions!inner(scheduled_on)')
      .eq('plan_id', planId)
      .eq('user_id', userId),
    db.from('units').select('id, idx, title').eq('plan_id', planId).order('idx'),
    db.from('topics').select('id, title, unit_id, mastery').eq('plan_id', planId),
  ]);

  // ---- Time -------------------------------------------------------------
  const byDate = new Map<string, number>();
  for (const log of logs ?? []) {
    byDate.set(log.logged_on, (byDate.get(log.logged_on) ?? 0) + log.minutes);
  }

  const heatmap = Array.from({ length: HEATMAP_DAYS }, (_, i) => {
    const date = addDays(today, -(HEATMAP_DAYS - 1 - i));
    return { date, minutes: byDate.get(date) ?? 0 };
  });

  const studiedDays = new Set([...byDate.entries()].filter(([, m]) => m > 0).map(([d]) => d));
  const { current: streak, longest: longestStreak } = streaks(studiedDays, today);

  const minutesTotal = [...byDate.values()].reduce((s, m) => s + m, 0);
  const minutesLast7 = heatmap.slice(-7).reduce((s, d) => s + d.minutes, 0);

  // ---- Pace -------------------------------------------------------------
  const daysElapsed = Math.max(0, diffDays(plan.start_date, today));
  const daysTotal = Math.max(1, diffDays(plan.start_date, plan.target_date));
  const daysLeft = Math.max(0, daysTotal - daysElapsed);

  const donePct = plan.total_items ? Math.round((plan.done_items / plan.total_items) * 100) : 0;
  const expectedPct = Math.min(100, Math.round((daysElapsed / daysTotal) * 100));
  const drift = donePct - expectedPct;

  const status: ProgressSnapshot['status'] =
    drift >= 8 ? 'ahead' : drift >= -8 ? 'on-track' : drift >= -20 ? 'slipping' : 'behind';

  const allItems = (items ?? []) as unknown as Array<{
    kind: string; status: string; est_minutes: number; sessions: { scheduled_on: string };
  }>;

  const overdueItems = allItems.filter(
    (i) => i.status === 'pending' && i.sessions.scheduled_on < today,
  ).length;

  const remainingMinutes = allItems
    .filter((i) => i.status === 'pending')
    .reduce((s, i) => s + i.est_minutes, 0);

  const requiredPace = daysLeft > 0 ? Math.round(remainingMinutes / daysLeft) : remainingMinutes;
  const dailyAverage = daysElapsed > 0 ? Math.round(minutesTotal / Math.max(1, daysElapsed)) : 0;

  // Projection uses the last 7 days, which reflects current habits better
  // than a lifetime average that includes an enthusiastic first week.
  const recentPace = minutesLast7 / 7;
  const projectedFinish =
    recentPace > 5 && remainingMinutes > 0
      ? addDays(today, Math.min(3650, Math.ceil(remainingMinutes / recentPace)))
      : null;

  // ---- Breakdowns -------------------------------------------------------
  const kindMap = new Map<string, { done: number; total: number }>();
  for (const item of allItems) {
    const entry = kindMap.get(item.kind) ?? { done: 0, total: 0 };
    entry.total++;
    if (item.status === 'done') entry.done++;
    kindMap.set(item.kind, entry);
  }

  const topicList = (topics ?? []) as Array<{ id: string; title: string; unit_id: string; mastery: number }>;
  const topicUnit = new Map(topicList.map((t) => [t.id, t.unit_id]));

  const unitStats = (units ?? []).map((unit: any) => {
    const unitTopics = topicList.filter((t) => t.unit_id === unit.id);
    const mastery = unitTopics.length
      ? Math.round(unitTopics.reduce((s, t) => s + t.mastery, 0) / unitTopics.length)
      : 0;
    return { title: unit.title, mastery, done: 0, total: unitTopics.length };
  });

  const weakTopics = topicList
    .filter((t) => t.mastery < 55)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 5)
    .map((t) => ({ id: t.id, title: t.title, mastery: t.mastery }));

  void topicUnit; // reserved for per-unit completion once item→unit joins land

  return {
    donePct,
    expectedPct,
    drift,
    status,
    streak,
    longestStreak,
    minutesTotal,
    minutesLast7,
    dailyAverage,
    daysElapsed,
    daysTotal,
    daysLeft,
    overdueItems,
    requiredPace,
    projectedFinish,
    heatmap,
    byKind: [...kindMap.entries()].map(([kind, v]) => ({ kind, ...v })),
    units: unitStats,
    weakTopics,
  };
}
