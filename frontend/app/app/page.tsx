import Link from 'next/link';
import { Plus, Target, ArrowRight } from 'lucide-react';
import { currentUser } from '../../lib/supabase/server';
import { admin } from '../../../backend/db/supabase';
import { todayIso } from '../../../backend/planner/calendar';
import { EmptyState, Button, PageHeader, Stagger, StaggerChild, FadeIn } from '../../components/ui';
import { PlanCard, type PlanSummary } from '../../components/plan-card';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const user = await currentUser();
  if (!user) return null;

  const db = admin();
  const today = todayIso();

  const { data: plans } = await db
    .from('plans')
    .select('id, title, prep_type, status, start_date, target_date, total_items, done_items, intake')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  const list = (plans ?? []) as PlanSummary[];

  // One query for today's load across every plan, instead of one per card.
  const { data: todayItems } = list.length
    ? await db
        .from('session_items')
        .select('plan_id, status, sessions!inner(scheduled_on)')
        .in('plan_id', list.map((p) => p.id))
        .eq('sessions.scheduled_on', today)
    : { data: [] };

  const todayLoad = new Map<string, { done: number; total: number }>();
  for (const item of (todayItems ?? []) as Array<{ plan_id: string; status: string }>) {
    const entry = todayLoad.get(item.plan_id) ?? { done: 0, total: 0 };
    entry.total++;
    if (item.status === 'done') entry.done++;
    todayLoad.set(item.plan_id, entry);
  }

  const firstName = user.name?.split(' ')[0] ?? 'there';

  // Rolled up across every plan, so the subtitle says something true about the
  // learner's day rather than just counting rows.
  const openToday = [...todayLoad.values()].reduce((sum, t) => sum + (t.total - t.done), 0);

  return (
    <div>
      <FadeIn>
        <PageHeader
          title={`${greeting()}, ${firstName}`}
          description={
            list.length === 0
              ? 'Nothing in progress yet.'
              : openToday > 0
                ? `${openToday} item${openToday === 1 ? '' : 's'} still scheduled for today across ${list.length} plan${list.length === 1 ? '' : 's'}.`
                : `${list.length} plan${list.length === 1 ? '' : 's'} in progress · today is clear.`
          }
          actions={
            list.length > 0 ? (
              <Button asChild>
                <Link href="/app/new">
                  <Plus className="h-4 w-4" />
                  New plan
                </Link>
              </Button>
            ) : undefined
          }
        />
      </FadeIn>

      <div className="mt-8">
        {list.length === 0 ? (
          <FadeIn delay={0.08}>
            <EmptyState
              icon={<Target />}
              title="Build your first prep map"
              description="Name what you're preparing for and when it's due. Kairo finds the material and maps every day between now and then."
              action={
                <Button asChild size="lg">
                  <Link href="/app/new">
                    Get started
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              }
            />
          </FadeIn>
        ) : (
          /*
            The grid climbs to four columns on an ultrawide. Capping at three
            left a 34" monitor showing a narrow band of cards down the middle
            with empty space either side; four keeps the card width in the same
            comfortable range instead of stretching each one.
          */
          <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4">
            {list.map((plan) => (
              <StaggerChild key={plan.id} className="min-w-0">
                <PlanCard plan={plan} today={todayLoad.get(plan.id)} />
              </StaggerChild>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}
