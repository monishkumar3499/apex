import { z } from 'zod';
import { requireUser, parseBody, ApiError, fail } from '../../../lib/api';
import { buildCoachTurn } from '../../../../backend/services/coach-service';
import { runStream } from '../../../../backend/ai/model-router';
import { admin } from '../../../../backend/db/supabase';
import { logger } from '../../../../backend/logger/pino';

export const runtime = 'nodejs';
export const maxDuration = 120;

const schema = z.object({
  planId: z.string().uuid(),
  message: z.string().min(1).max(4000),
});

/**
 * Streaming coach reply.
 *
 * Streaming matters more here than anywhere else in the app: a learner stuck
 * on a concept at 11pm will not wait 12 seconds staring at a spinner. First
 * token lands in well under a second.
 */
export async function POST(request: Request): Promise<Response> {
  let user;
  try {
    user = await requireUser();
  } catch (error) {
    return fail(error instanceof ApiError ? error.status : 500, 'Sign in to continue');
  }

  let body;
  try {
    body = await parseBody(request, schema);
  } catch (error) {
    return fail(error instanceof ApiError ? error.status : 400, (error as Error).message);
  }

  const db = admin();

  let turn;
  try {
    turn = await buildCoachTurn({ planId: body.planId, userId: user.id, question: body.message });
  } catch (error) {
    return fail(404, (error as Error).message);
  }

  await db.from('messages').insert({
    chat_id: turn.chatId,
    user_id: user.id,
    role: 'user',
    content: body.message,
  });

  const encoder = new TextEncoder();
  let answer = '';

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const generator = runStream({
          tier: 'chat',
          label: 'coach',
          messages: turn.messages,
          temperature: 0.4,
          // Reasoning is disabled outright, not merely capped: the coach
          // streams straight to the UI, and thinking before the first token is
          // exactly the spinner this endpoint exists to avoid. Endpoints that
          // mandate reasoning are retried without the hint by the client.
          maxTokens: 4000,
          reasoning: { enabled: false },
          // A coach question is one small call, and it must not sit behind
          // somebody else's in-flight six-month build. Tagging the owner puts
          // it in its own lane at the provider gate.
          owner: user.id,
        });

        for await (const delta of generator) {
          answer += delta;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
        }

        if (answer.trim()) {
          await db.from('messages').insert({
            chat_id: turn.chatId,
            user_id: user.id,
            role: 'assistant',
            content: answer,
            tokens: turn.estimatedPromptTokens + Math.ceil(answer.length / 4),
          });
        }

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
      } catch (error) {
        logger.error({ error, planId: body.planId }, 'coach stream failed');
        const message =
          answer.trim().length > 0
            ? '\n\n_(reply cut short — ask again if you need the rest)_'
            : 'I could not reach the model just now. Try again in a moment.';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: message })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, error: true })}\n\n`));
      } finally {
        try { controller.close(); } catch { /* already closed */ }
      }
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
