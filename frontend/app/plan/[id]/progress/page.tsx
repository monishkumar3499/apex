import { redirect } from 'next/navigation';
import { currentUser } from '../../../../lib/supabase/server';
import { admin } from '../../../../../backend/db/supabase';
import { getProgress } from '../../../../../backend/services/progress-service';
import { ProgressView } from '../../../../components/progress-view';
import { EmptyState } from '../../../../components/ui';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export default async function ProgressPage({ params }: Props) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/plan/${id}/progress`);

  const { data: plan } = await admin()
    .from('plans')
    .select('weekday_minutes, target_date')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!plan) redirect('/app');

  let data;
  try {
    data = await getProgress(id, user.id);
  } catch {
    return <EmptyState title="Progress unavailable" description="We could not load your analytics just now." />;
  }

  return (
    <ProgressView
      planId={id}
      data={data}
      dailyTarget={plan.weekday_minutes}
      targetDate={plan.target_date}
    />
  );
}
