import { route, ok, requireUser } from '../../../../../lib/api';
import { replan } from '../../../../../../backend/services/plan-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/**
 * Adaptive rescheduling. Moves overdue work forward across the days that
 * actually remain, respecting daily capacity. Costs no tokens.
 */
export const POST = route('plans.replan', async (_request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;

  const result = await replan(id, user.id);
  return ok(result);
});
