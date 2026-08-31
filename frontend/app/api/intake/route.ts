import { z } from 'zod';
import { route, ok, requireUser, parseBody } from '../../../lib/api';
import { classifyGoal } from '../../../../backend/services/plan-service';

export const runtime = 'nodejs';

const schema = z.object({
  goal: z.string().min(3).max(200),
  level: z.string().default('beginner'),
  weeks: z.number().min(1).max(104).default(12),
  hoursPerWeek: z.number().min(1).max(80).default(14),
});

/**
 * Step 1 of the wizard. Classifies the goal and returns up to two
 * goal-specific follow-up questions, so the intake adapts to what the learner
 * is actually preparing for rather than asking everyone the same five things.
 */
export const POST = route('intake', async (request) => {
  await requireUser();
  const body = await parseBody(request, schema);

  const intake = await classifyGoal({
    goal: body.goal,
    level: body.level ?? 'beginner',
    weeks: body.weeks ?? 12,
    hoursPerWeek: body.hoursPerWeek ?? 14,
  });

  return ok(intake);
});
