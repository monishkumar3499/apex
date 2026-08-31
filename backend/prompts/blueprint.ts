/**
 * Stage 2 — Structure generation.
 *
 * The single substantial model call in a plan build. It emits ONLY the
 * knowledge structure (units → topics) plus one search intent per unit.
 *
 * It deliberately does NOT emit:
 *   • dates or day numbers  → the scheduler computes these correctly
 *   • URLs or resource names → the curation pipeline fetches real ones
 *   • daily task lists      → derived from topics, at zero token cost
 *
 * Short JSON keys are worth roughly 30% of output tokens on a 40-topic plan.
 */

export const BLUEPRINT_SYSTEM = `You are a curriculum architect. Output ONLY compact JSON. No prose, no code fences, no markdown.

Schema (keys are abbreviated — use exactly these):
{"u":[{"t":"unit title","s":"one-line scope","w":1-5,"q":["youtube search query"],"tp":[{"t":"topic title","s":"one line: what this topic is","o":["observable outcome"],"k":["keyword"],"m":60,"d":1-5,"w":1-5,"dep":[]}]}]}

Field meanings:
u   units, in teaching order (broad phases of the subject)
t   title            s  one-line summary
w   weight 1-5: exam weightage, or importance to the target role
q   ONE natural search query that would surface good video lectures for this unit. Write it as a person would type it into YouTube. No URLs.
tp  topics inside the unit, in teaching order
o   1-3 outcomes, each starting with a verb ("Derive...", "Implement...", "Distinguish...")
k   3-6 lowercase keywords/synonyms used to match this topic to real resources. Include the terms practitioners actually use, including acronyms.
m   estimated MINUTES of first-pass study for an average learner at the stated level. Be honest: a hard topic is 120-240, a light one is 30-45.
d   conceptual difficulty 1-5
dep global topic numbers (1-based across the whole plan, counting topics in order) that must be understood first. Usually [] or one entry. Never reference a later topic.

Hard rules:
- Cover the FULL scope. For an exam, mirror the official syllabus unit-by-unit. For a role, cover fundamentals through the advanced work that role actually does.
- Produce EXACTLY the topic count requested. Split broad areas rather than padding with filler.
- Topic titles must be specific and searchable ("Setup and hold time violations", not "Timing concepts").
- Sum of m across all topics should land near the stated study budget. Weight it toward high-w areas.
- Order matters: prerequisites first. dep is for cross-unit needs only.
- No URLs, no channel names, no book titles, no dates, no day numbers.`;

export interface BlueprintTopic {
  t: string;
  s?: string;
  o?: string[];
  k?: string[];
  m?: number;
  d?: number;
  w?: number;
  dep?: number[];
}

export interface BlueprintUnit {
  t: string;
  s?: string;
  w?: number;
  q?: string[];
  tp: BlueprintTopic[];
}

export interface BlueprintResult {
  u: BlueprintUnit[];
}

/** Coerce a scalar the model emitted where the schema asked for a list. */
function asArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || value === undefined || value === '') return [];
  return [value as T];
}

/**
 * Force a parsed blueprint into the declared shape.
 *
 * The schema asks for arrays, but the field notes say things like "ONE natural
 * search query", and models take that literally and emit a bare string. Every
 * downstream `.map`/`.slice` then throws mid-build. Normalising once here means
 * the rest of the pipeline — and anything read back out of `blueprint_cache` —
 * can trust the types.
 */
export function normalizeBlueprint(raw: unknown): BlueprintResult {
  const units = asArray<Record<string, unknown>>((raw as BlueprintResult)?.u);

  return {
    u: units
      .filter((u) => u && typeof u === 'object')
      .map((u) => ({
        t: String(u.t ?? ''),
        s: u.s === undefined || u.s === null ? undefined : String(u.s),
        w: u.w === undefined ? undefined : Number(u.w),
        q: asArray<unknown>(u.q).map(String),
        tp: asArray<Record<string, unknown>>(u.tp)
          .filter((t) => t && typeof t === 'object')
          .map((t) => ({
            t: String(t.t ?? ''),
            s: t.s === undefined || t.s === null ? undefined : String(t.s),
            o: asArray<unknown>(t.o).map(String),
            k: asArray<unknown>(t.k).map(String),
            m: t.m === undefined ? undefined : Number(t.m),
            d: t.d === undefined ? undefined : Number(t.d),
            w: t.w === undefined ? undefined : Number(t.w),
            dep: asArray<unknown>(t.dep).map(Number).filter(Number.isFinite),
          })),
      })),
  };
}

export interface BlueprintRequest {
  subject: string;
  prepType: 'exam' | 'skill' | 'hybrid';
  scope: string;
  level: string;
  weeks: number;
  studyHours: number;
  topicTarget: number;
  unitTarget: number;
  extras: Record<string, string>;
}

export function blueprintUser(req: BlueprintRequest): string {
  const focus =
    req.prepType === 'exam'
      ? 'Mirror the official syllabus. Set w from real exam weightage. Favour breadth of coverage — an unexamined unit is a lost mark.'
      : req.prepType === 'skill'
        ? 'Mirror what the role actually does day to day. Set w from how often the skill is used and screened for. Favour depth on the load-bearing fundamentals.'
        : 'Cover the certification syllabus, then the practical skills the role needs beyond it.';

  const extras = Object.entries(req.extras)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

  return `Subject: ${req.subject}
Type: ${req.prepType}
Mastery target: ${req.scope}
Learner level: ${req.level}
Timeline: ${req.weeks} weeks
Total first-pass study budget: ${req.studyHours} hours
${extras ? `\nLearner specifics:\n${extras}` : ''}

Produce ${req.unitTarget} units containing EXACTLY ${req.topicTarget} topics in total.
${focus}

Output the JSON now.`;
}

export const BLUEPRINT_SCHEMA_HINT =
  '{"u":[{"t":"string","s":"string","w":3,"q":["string"],"tp":[{"t":"string","s":"string","o":["string"],"k":["string"],"m":60,"d":3,"w":3,"dep":[]}]}]}';
