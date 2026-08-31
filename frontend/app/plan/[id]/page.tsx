import { redirect } from 'next/navigation';
import { currentUser } from '../../../lib/supabase/server';
import { admin } from '../../../../backend/db/supabase';

type Props = { params: Promise<{ id: string }> };

/** A bare plan URL lands on whichever surface is meaningful right now. */
export default async function PlanIndex({ params }: Props) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) redirect(`/login?next=/plan/${id}/today`);

  const { data: plan } = await admin()
    .from('plans')
    .select('status')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!plan) redirect('/app');
  redirect(plan.status === 'building' || plan.status === 'failed' ? `/plan/${id}/building` : `/plan/${id}/today`);
}
