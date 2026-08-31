/**
 * Drill question generation — lazy and cached.
 *
 * Questions are generated the first time a learner drills a topic, not during
 * the plan build. On a 40-topic plan that defers (and usually avoids
 * entirely) ~35,000 tokens of generation the learner may never open.
 */

export const PRACTICE_SYSTEM = `You write exam-grade practice questions. Output ONLY compact JSON. No prose, no code fences.

Schema:
{"q":[{"k":"mcq|short|flash","s":"question stem","o":["A","B","C","D"],"a":"exact correct option text, or the answer for short/flash","e":"why this is right AND why the tempting wrong answer is wrong","d":1-5}]}

Rules:
- Test understanding, not recall of wording. A learner who memorised the definition should still be able to get it wrong.
- MCQ distractors must encode real misconceptions in this topic — the mistake a learner actually makes. Never use filler options ("None of the above", obviously absurd values).
- "a" must be character-identical to one entry in "o" for mcq.
- "e" is 1-2 sentences. Name the misconception the distractor represents.
- "flash" items are for the atoms worth memorising (a formula, a definition, a threshold). "o" is [] for flash and short.
- Vary d across the set. Include at least one question at d>=4 that requires combining two ideas.
- Use the notation and units a practitioner in this field would use.
- No references to "the video", "the course", or "the lecture" — questions must stand alone.`;

export interface PracticeQuestion {
  k: 'mcq' | 'short' | 'flash';
  s: string;
  o: string[];
  a: string;
  e: string;
  d: number;
}

export interface PracticeResult {
  q: PracticeQuestion[];
}

export function practiceUser(params: {
  subject: string;
  topic: string;
  summary?: string;
  outcomes?: string[];
  level: string;
  count: number;
  prepType: 'exam' | 'skill' | 'hybrid';
}): string {
  const mix =
    params.prepType === 'exam'
      ? `${Math.max(1, Math.round(params.count * 0.6))} mcq, ${Math.max(1, Math.round(params.count * 0.2))} short, rest flash`
      : `${Math.max(1, Math.round(params.count * 0.5))} mcq, ${Math.max(1, Math.round(params.count * 0.3))} short, rest flash`;

  return `Subject: ${params.subject}
Topic: ${params.topic}${params.summary ? `\nScope: ${params.summary}` : ''}
${params.outcomes?.length ? `Target outcomes:\n${params.outcomes.map((o) => `- ${o}`).join('\n')}` : ''}
Learner level: ${params.level}

Write exactly ${params.count} questions (${mix}).`;
}

export const PRACTICE_SCHEMA_HINT =
  '{"q":[{"k":"mcq","s":"string","o":["string"],"a":"string","e":"string","d":3}]}';
