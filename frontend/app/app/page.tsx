import Link from 'next/link';
import { Plus, Target, ArrowRight } from 'lucide-react';
import { currentUser } from '../../lib/supabase/server';
import { admin } from '../../../backend/db/supabase';
import { todayIso } from '../../../backend/planner/calendar';
import { EmptyState, Button } from '../../components/ui';
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

  return (
    <div className="animate-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1.5 text-sm text-ink-muted">
            {list.length
              ? `${list.length} plan${list.length === 1 ? '' : 's'} in progress.`
              : 'Nothing in progress yet.'}
          </p>
        </div>

        {list.length > 0 && (
          <Link href="/app/new">
            <Button>
              <Plus className="h-4 w-4" />
              New plan
            </Button>
          </Link>
        )}
      </div>

      <div className="mt-8">
        {list.length === 0 ? (
          <EmptyState
            icon={<Target className="h-5 w-5" />}
            title="Build your first prep map"
            description="Name what you're preparing for and when it's due. APEX finds the material and maps every day between now and then."
            action={
              <Link href="/app/new">
                <Button size="lg">
                  Get started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {list.map((plan) => (
              <PlanCard key={plan.id} plan={plan} today={todayLoad.get(plan.id)} />
            ))}
          </div>
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
