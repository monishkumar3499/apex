import { redirect, notFound } from 'next/navigation';
import { currentUser } from '../../../lib/supabase/server';
import { admin } from '../../../../backend/db/supabase';
import { getProgress } from '../../../../backend/services/progress-service';
import { PlanSidebar } from '../../../components/plan-sidebar';

export const dynamic = 'force-dynamic';

type Props = { children: React.ReactNode; params: Promise<{ id: string }> };

export default async function PlanLayout({ children, params }: Props) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/plan/${id}/today`);

  const { data: plan } = await admin()
    .from('plans')
    .select('id, title, status, prep_type, start_date, target_date, total_items, done_items')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!plan) notFound();

  // The build view owns the whole screen — no sidebar to navigate to yet.
  if (plan.status === 'building' || plan.status === 'failed') {
    return <>{children}</>;
  }

  let streak = 0;
  let status: string = 'on-track';
  try {
    const progress = await getProgress(id, user.id);
    streak = progress.streak;
    status = progress.status;
  } catch {
    // Analytics must never take the workspace down.
  }

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <PlanSidebar
        plan={{
          id: plan.id,
          title: plan.title,
          totalItems: plan.total_items,
          doneItems: plan.done_items,
          startDate: plan.start_date,
          targetDate: plan.target_date,
        }}
        streak={streak}
        paceStatus={status}
        user={{ name: user.name, email: user.email, avatarUrl: user.avatarUrl }}
      />

      <div className="w-full min-w-0 flex-1 md:pl-sidebar">
        {/*
          `pb-tabsafe` clears the fixed mobile tab bar *and* the iOS home
          indicator, so the last item in a list is never half-covered. On
          desktop there is no bar, so the padding drops back to normal.
        */}
        <main className="mx-auto w-full max-w-4xl px-4 py-6 pb-tabsafe sm:px-6 sm:py-8 md:px-8 md:py-10 md:pb-16">
          {children}
        </main>
      </div>
    </div>
  );
}
