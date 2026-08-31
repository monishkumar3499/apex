import { z } from 'zod';
import { route, ok, requireUser, parseBody } from '../../../lib/api';
import { drillQueue, ensureQuestions, gradeAnswer, logDrill } from '../../../../backend/services/practice-service';

export const runtime = 'nodejs';
export const maxDuration = 120;

const querySchema = z.object({
  planId: z.string().uuid(),
  topicId: z.string().uuid().optional(),
  limit: z.number().min(1).max(40).default(15),
  generate: z.boolean().default(false),
});

const gradeSchema = z.object({
  planId: z.string().uuid(),
  questionId: z.string().uuid(),
  button: z.enum(['again', 'hard', 'good', 'easy']),
});

const logSchema = z.object({
  planId: z.string().uuid(),
  minutes: z.number().min(0).max(600),
  cards: z.number().min(0).max(500),
});

/** Fetch the next batch of cards, generating them on first use for a topic. */
export const POST = route('drill.queue', async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, querySchema);

  if (body.generate && body.topicId) {
    await ensureQuestions({ planId: body.planId, topicId: body.topicId, userId: user.id });
  }

  let cards = await drillQueue({
    planId: body.planId,
    userId: user.id,
    topicId: body.topicId,
    limit: body.limit,
  });

  // An empty queue for a specific topic means nothing has been generated yet.
  if (!cards.length && body.topicId && !body.generate) {
    await ensureQuestions({ planId: body.planId, topicId: body.topicId, userId: user.id });
    cards = await drillQueue({
      planId: body.planId,
      userId: user.id,
      topicId: body.topicId,
      limit: body.limit,
    });
  }

  return ok(cards);
});

export const PATCH = route('drill.grade', async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, gradeSchema);

  const result = await gradeAnswer({
    planId: body.planId,
    userId: user.id,
    questionId: body.questionId,
    button: body.button,
  });

  return ok(result);
});

export const PUT = route('drill.log', async (request) => {
  const user = await requireUser();
  const body = await parseBody(request, logSchema);

  await logDrill({ planId: body.planId, userId: user.id, minutes: body.minutes, cards: body.cards });
  return ok({ logged: true });
});
