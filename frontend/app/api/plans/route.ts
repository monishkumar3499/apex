import { z } from 'zod';
import { route, ok, requireUser, parseBody } from '../../../lib/api';
import { createPlan, buildPlan } from '../../../../backend/services/plan-service';
import { admin } from '../../../../backend/db/supabase';
import { checkCapacity } from '../../../../backend/planner/capacity';
import { diffDays } from '../../../../backend/planner/calendar';
import { logger } from '../../../../backend/logger/pino';

export const runtime = 'nodejs';
export const maxDuration = 300;

const intakeSchema = z.object({
  pt: z.enum(['exam', 'skill', 'hybrid']),
  sub: z.string(),
  slug: z.string(),
  lvl: z.string(),
  conf: z.number(),
  scope: z.string(),
  ask: z.array(z.object({ id: z.string(), q: z.string(), opts: z.array(z.string()) })).default([]),
  // Set when /api/intake fell back instead of classifying. Zod strips unknown
  // keys, so it has to be declared here or the build never learns about it.
  degraded: z.boolean().optional(),
  degradedReason: z.string().optional(),
});

const schema = z.object({
  title: z.string().min(3).max(200),
  level: z.string().min(2),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /*
    Both may be zero. The rule is on the *total*, not on either kind of day —
    "I only study at weekends" is a legitimate answer, and a 15-minute weekday
    floor rejected it while happily accepting 20 minutes a week for a year.
    `checkCapacity` below is what actually decides.
  */
  weekdayMinutes: z.number().min(0).max(900),
  weekendMinutes: z.number().min(0).max(900),
  restDays: z.array(z.number().min(0).max(6)).max(6).default([]),
  intake: intakeSchema,
  extras: z.record(z.string()).default({}),
});

export const GET = route('plans.list', async () => {
  const user = await requireUser();

  const { data, error } = await admin()
    .from('plans')
    .select('id, title, prep_type, status, start_date, target_date, total_items, done_items, created_at, subject_slug')
    .eq('user_id', user.id)
    .neq('status', 'archived')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ok(data ?? []);
});

export const POST = route('plans.create', async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, schema);

  if (new Date(body.targetDate) <= new Date(body.startDate)) {
    return ok({ error: 'Target date must be after the start date' }, { status: 400 });
  }

  /*
    The same check the wizard runs, applied again here.

    Not redundant: the wizard can only disable its own button, and this is a
    public JSON endpoint. Sharing one implementation is what keeps the two from
    drifting into disagreeing about what a valid plan is.
  */
  const capacity = checkCapacity({
    startDate: body.startDate,
    targetDate: body.targetDate,
    weekdayMinutes: body.weekdayMinutes,
    weekendMinutes: body.weekendMinutes,
    restDays: body.restDays ?? [],
    prepType: body.intake.pt,
    level: body.level,
    weeks: Math.max(1, Math.round(diffDays(body.startDate, body.targetDate) / 7)),
  });

  if (!capacity.ok) {
    return ok(
      {
        error: capacity.message,
        // Echoed so a client can render the shortfall rather than just the
        // sentence — the wizard shows both numbers on its budget card.
        capacity: {
          totalMinutes: capacity.totalMinutes,
          minimumMinutes: capacity.minimumMinutes,
          reason: capacity.reason,
        },
      },
      { status: 400 },
    );
  }

  const plan = await createPlan({
    userId: user.id,
    title: body.title,
    level: body.level,
    startDate: body.startDate,
    targetDate: body.targetDate,
    weekdayMinutes: body.weekdayMinutes,
    weekendMinutes: body.weekendMinutes,
    restDays: body.restDays ?? [],
    extras: body.extras ?? {},
    intake: { ...body.intake, ask: body.intake.ask ?? [] },
  });

  // Build runs detached: the client navigates straight to the live build view
  // and watches plan_events stream in, rather than holding an open request.
  void buildPlan(plan.id).catch((error) =>
    logger.error({ error, planId: plan.id }, 'detached plan build failed'),
  );

  return ok({ id: plan.id }, { status: 201 });
});
