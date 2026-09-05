import { redirect, notFound } from 'next/navigation';
import { currentUser } from '../../../lib/supabase/server';
import { admin } from '../../../../backend/db/supabase';
import { getProgress } from '../../../../backend/services/progress-service';
import { PlanSidebar } from '../../../components/plan-sidebar';
import { Void } from '../../../components/ui';

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
    <div className="relative flex min-h-dvh flex-col md:flex-row">
      {/*
        One void for the whole workspace, fixed behind everything.

        `fixed` rather than `absolute` because every screen in here scrolls: an
        absolutely positioned aurora would scroll off the top of a long plan map
        and the rest of the page would end on flat black. `-z-10` puts it behind
        the sidebar's own backdrop-blur, which is what lets the rail frost the
        aurora instead of frosting nothing.
      */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <Void variant="ambient" />
      </div>

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

      {/* Padded by the same variable the rail is sized by, so collapsing it
          widens the content in the same frame — and a server component can
          follow client-side rail state without knowing it exists. */}
      <div className="w-full min-w-0 flex-1 transition-[padding] duration-300 ease-out md:pl-[var(--rail-w)]">
        {/*
          `pb-tabsafe` clears the fixed mobile tab bar *and* the iOS home
          indicator, so the last item in a list is never half-covered. On
          desktop there is no bar, so the padding drops back to normal.

          The column grows past 4xl on large monitors. Holding every workspace
          screen at 56rem left a 34" display two-thirds empty, but an uncapped
          column runs the map's topic rows out to 150 characters — so it steps
          once and stops.
        */}
        <main
          id="main"
          className="mx-auto w-full max-w-4xl px-4 py-6 pb-tabsafe sm:px-6 sm:py-8 md:px-8 md:py-10 md:pb-16 xl:max-w-5xl 3xl:max-w-6xl"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
