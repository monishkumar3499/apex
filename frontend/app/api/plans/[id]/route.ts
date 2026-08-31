import { route, ok, fail, requireUser } from '../../../../lib/api';
import { admin } from '../../../../../backend/db/supabase';
import { buildPlan } from '../../../../../backend/services/plan-service';
import { logger } from '../../../../../backend/logger/pino';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

export const DELETE = route('plans.delete', async (_request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  // Scoped by user_id: the service-role key bypasses RLS, so ownership is
  // enforced here rather than by the database.
  const { error } = await admin().from('plans').delete().eq('id', id).eq('user_id', user.id);
  if (error) return fail(500, error.message);

  return ok({ deleted: id });
});

/** Retry a failed build without losing the plan's settings. */
export const POST = route('plans.rebuild', async (_request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const db = admin();

  const { data: plan } = await db.from('plans').select('id, status').eq('id', id).eq('user_id', user.id).single();
  if (!plan) return fail(404, 'Plan not found');
  if (plan.status === 'building') return fail(409, 'This plan is already building');

  // Clear prior partial output so a retry cannot duplicate rows.
  await Promise.all([
    db.from('sessions').delete().eq('plan_id', id),
    db.from('units').delete().eq('plan_id', id),
    db.from('resources').delete().eq('plan_id', id),
    db.from('mocks').delete().eq('plan_id', id),
    db.from('plan_events').delete().eq('plan_id', id),
  ]);
  await db.from('plans').update({ status: 'building', build_error: null }).eq('id', id);

  void buildPlan(id).catch((error) => logger.error({ error, planId: id }, 'rebuild failed'));

  return ok({ rebuilding: id });
});
