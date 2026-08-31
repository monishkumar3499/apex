import { requireUser, ApiError } from '../../../../../lib/api';
import { admin } from '../../../../../../backend/db/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

/**
 * Server-sent build progress.
 *
 * The build runs detached, so the client subscribes here and watches stages
 * land in real time — "Designing 48 topics", "31 verified resources
 * attached", "126 study days scheduled". A spinner with no narration for two
 * minutes is the fastest way to lose a new user.
 */
export async function GET(_request: Request, { params }: Params): Promise<Response> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    const status = error instanceof ApiError ? error.status : 500;
    return new Response('unauthorized', { status });
  }

  const { id } = await params;
  const db = admin();

  const { data: plan } = await db
    .from('plans')
    .select('id, status')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (!plan) return new Response('not found', { status: 404 });

  const encoder = new TextEncoder();
  let lastId = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const finish = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      };

      const tick = async () => {
        if (closed) return;
        try {
          const { data: events } = await db
            .from('plan_events')
            .select('id, stage, status, message, meta, created_at')
            .eq('plan_id', id)
            .gt('id', lastId)
            .order('id', { ascending: true });

          for (const event of events ?? []) {
            lastId = Number(event.id);
            send('stage', event);
          }

          const { data: current } = await db.from('plans').select('status, build_error').eq('id', id).single();

          if (current?.status === 'ready') {
            send('done', { status: 'ready' });
            finish();
          } else if (current?.status === 'failed') {
            send('done', { status: 'failed', error: current.build_error });
            finish();
          }
        } catch {
          // A transient database blip should not tear the stream down.
        }
      };

      const timer = setInterval(tick, 900);
      send('open', { planId: id });
      await tick();

      // Hard stop so a wedged build cannot hold a connection forever.
      setTimeout(() => { send('done', { status: 'timeout' }); finish(); }, 280_000);
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
