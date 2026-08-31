import { z } from 'zod';
import { route, ok, fail, requireUser, parseBody } from '../../../../lib/api';
import { admin } from '../../../../../backend/db/supabase';
import { todayIso } from '../../../../../backend/planner/calendar';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

const schema = z.object({ status: z.enum(['pending', 'done', 'skipped']) });

/**
 * Tick an item off.
 *
 * Completion also writes a study log entry, which is what drives streaks,
 * time-on-task and the pace projection. Doing it here keeps those numbers
 * honest — they reflect work actually marked done, not planned minutes.
 */
export const PATCH = route('items.update', async (request, { params }: Params) => {
  const user = await requireUser();
  const { id } = await params;
  const { status } = await parseBody(request, schema);
  const db = admin();

  const { data: existing } = await db
    .from('session_items')
    .select('id, plan_id, status, est_minutes, topic_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!existing) return fail(404, 'Item not found');

  const { data: updated, error } = await db
    .from('session_items')
    .update({ status, completed_at: status === 'done' ? new Date().toISOString() : null })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, status, est_minutes')
    .single();

  if (error) return fail(500, error.message);

  // Only log the transition into done, and only once.
  if (status === 'done' && existing.status !== 'done') {
    const today = todayIso();
    const { data: log } = await db
      .from('study_logs')
      .select('id, minutes, items_done')
      .eq('user_id', user.id)
      .eq('plan_id', existing.plan_id)
      .eq('logged_on', today)
      .eq('source', 'session')
      .maybeSingle();

    if (log) {
      await db
        .from('study_logs')
        .update({ minutes: log.minutes + existing.est_minutes, items_done: log.items_done + 1 })
        .eq('id', log.id);
    } else {
      await db.from('study_logs').insert({
        user_id: user.id,
        plan_id: existing.plan_id,
        logged_on: today,
        minutes: existing.est_minutes,
        items_done: 1,
        source: 'session',
      });
    }

    // Completing work nudges topic mastery even without drilling it.
    if (existing.topic_id) {
      const { data: topic } = await db
        .from('topics')
        .select('mastery')
        .eq('id', existing.topic_id)
        .single();
      if (topic) {
        await db
          .from('topics')
          .update({ mastery: Math.min(100, topic.mastery + 8) })
          .eq('id', existing.topic_id);
      }
    }
  }

  return ok(updated);
});
