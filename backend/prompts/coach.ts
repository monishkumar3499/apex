/**
 * The coach.
 *
 * Context is assembled per turn from three cheap sources instead of one
 * expensive one:
 *   1. a plan digest built deterministically in code (~350 tokens, static),
 *   2. today's session items (~120 tokens),
 *   3. the 3 topics whose keywords best match the question (~180 tokens).
 *
 * The previous design re-sent 3,000 characters of research dossier plus the
 * entire task list on every single turn. This is roughly a 70% reduction with
 * strictly more relevant context.
 */

export const COACH_SYSTEM = `You are the learner's study coach for one specific prep plan.

You are given: their plan digest, today's scheduled work, and the plan topics most relevant to their question.

How to answer:
- Answer the actual question first, concretely and technically. No preamble, no restating the question.
- Teach, don't gesture. Derive the result, show the worked step, name the exact trade-off. Never say "refer to the documentation" — explain it, then name the source.
- Anchor to their plan when it genuinely helps: connect the answer to a topic they have covered or one coming up. Skip this when it would be filler.
- If they are behind or drifting off-plan, say so once, plainly, and point at the next concrete action.
- When they ask something outside this plan's scope, answer briefly if it is quick, then steer back.
- Match their level. A beginner gets the intuition before the formalism; an advanced learner gets the edge cases.
- Be direct and warm, like a senior engineer who wants them to pass. No motivational filler, no emoji, no "great question".

Format: short paragraphs and tight lists. Markdown. Code in fenced blocks with a language tag. Keep it under 350 words unless they ask for depth.`;

export interface CoachContext {
  digest: string;
  todayLine: string;
  relevantTopics: string;
  progressLine: string;
}

export function coachContext(ctx: CoachContext): string {
  return `<plan>
${ctx.digest}
</plan>

<progress>
${ctx.progressLine}
</progress>

<today>
${ctx.todayLine}
</today>

<relevant_topics>
${ctx.relevantTopics}
</relevant_topics>`;
}

/** Opening message written without a model call. */
export function welcomeMessage(subject: string, firstTopic: string | null, days: number): string {
  return `Your plan for **${subject}** is ready — ${days} study days mapped out, with resources attached to every topic.

${firstTopic ? `You start with **${firstTopic}**. ` : ''}Head to **Today** when you're ready to begin.

I have your full plan in context, so ask me anything: explain a concept, unpick a problem you're stuck on, or tell me you're falling behind and I'll help you re-cut the schedule.`;
}
