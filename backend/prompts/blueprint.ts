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
 *
 * ---------------------------------------------------------------------------
 * Why the prompt reads the way it does
 *
 * The failure mode of a curriculum model is not inaccuracy — it is producing a
 * syllabus that is *correct and unusable*. Left alone it emits titles like
 * "Advanced Transform-Domain Techniques and Their Applications", estimates
 * four hours of first-pass study, and fuses three ideas into one entry. A
 * learner opening that on a Tuesday evening does not know what to do, cannot
 * finish it, and stops opening the app.
 *
 * So the rules below encode how people actually learn rather than how subjects
 * are catalogued:
 *
 *   One idea per topic       Working memory holds a handful of new elements.
 *                            A topic joining two ideas with "and" is two
 *                            topics that will be half-learned as one.
 *   Sittings, not sessions   Every topic must be finishable. A completed small
 *                            block builds the sense of progress that keeps
 *                            someone coming back; an unfinishable one teaches
 *                            them the plan is not for them.
 *   Early wins first         Self-efficacy predicts persistence better than
 *                            motivation does, so the first unit opens with
 *                            material the learner can actually clear.
 *   Ramped difficulty        New material lands on top of something already
 *                            secure, so each unit starts easy and climbs.
 *   Recognisable titles      A title has to mean something *before* the topic
 *                            is studied — that is what makes a plan feel
 *                            navigable instead of intimidating.
 * ---------------------------------------------------------------------------
 */

/**
 * Bumped whenever the prompt or the sizing rules change.
 *
 * It is part of the blueprint cache key. Without it, every learner who already
 * generated a plan for a subject keeps being served the structure produced by
 * the *previous* prompt — so a change to how coursework is shaped silently
 * never reaches the people it was written for.
 */
export const BLUEPRINT_VERSION = 2;

/** Hard bounds on a single topic's first-pass estimate, in minutes. */
export const TOPIC_MIN_MINUTES = 20;
export const TOPIC_MAX_MINUTES = 120;

export const BLUEPRINT_SYSTEM = `You are a curriculum architect who designs for real learners, not for catalogues. Output ONLY compact JSON. No prose, no code fences, no markdown.

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
m   estimated MINUTES of first-pass study for a learner at the stated level
d   conceptual difficulty 1-5
dep global topic numbers (1-based across the whole plan, counting topics in order) that must be understood first. Usually [] or one entry. Never reference a later topic.

COVERAGE RULES
- Cover the FULL scope. For an exam, mirror the official syllabus unit-by-unit. For a role, cover fundamentals through the advanced work that role actually does.
- Produce EXACTLY the topic count requested. Split broad areas rather than padding with filler.
- Order matters: prerequisites first. dep is for cross-unit needs only.
- No URLs, no channel names, no book titles, no dates, no day numbers.

LEARNER RULES — these decide whether the plan gets used at all
- ONE IDEA PER TOPIC. If a title needs "and", or "introduction to X and Y", it is two topics. Split it.
- SIZE FOR A SITTING. m must be between ${TOPIC_MIN_MINUTES} and ${TOPIC_MAX_MINUTES}; aim for 40-75. Anything a learner cannot finish in one or two sittings must be split into separate topics, not estimated larger.
- START WITH WINS. The first 2-3 topics of unit 1 must be d=1 or d=2 — something a nervous beginner can complete on day one.
- RAMP THE DIFFICULTY. Inside every unit, d generally increases. Never open a unit at d=5.
- WRITE TITLES A LEARNER RECOGNISES BEFORE STUDYING. Specific and searchable, but in the words a learner would use: "Setup and hold time violations", not "Temporal constraint analysis in synchronous digital systems". Never "Timing concepts".
- s is one plain sentence a beginner understands. No jargon that the topic itself is about to teach.
- o are outcomes the learner could actually check themselves on. "Calculate the propagation delay of a 3-stage chain", not "Understand delay".
- BE HONEST ABOUT m. A genuinely hard idea gets 90-120 and a separate follow-up topic for practice depth; a light one gets 25-40. Do not pad and do not compress.
- Weight m toward high-w areas: important material earns more topics, not longer ones.`;

/* ===========================================================================
   Sharded generation
   ---------------------------------------------------------------------------
   `BLUEPRINT_SYSTEM` above asks for the whole structure in one response. On a
   65-topic plan that is ~6,000 output tokens, and output tokens are emitted
   serially: measured against the live API, one such call takes **33 seconds**.
   It is by far the largest single contributor to how long a learner watches
   the build screen.

   Splitting the work makes that time parallel instead of serial:

     1. OUTLINE  one small call (~300 tokens, ~4s) for the units alone.
     2. TOPICS   two or three calls, run concurrently, each filling in the
                 topics for a slice of those units.

   Wall-clock becomes `outline + slowest shard` rather than the sum, and the
   shards also fail independently — losing one unit's topics degrades the plan
   instead of failing the build.

   Why not one call per unit: the free Gemini tier allows ~10 requests per
   minute, and a plan build already spends one on classification. Ten shards
   would rate-limit the build reliably. Three is the point where the latency
   win is mostly captured and the quota is not at risk.
   =========================================================================== */

export const OUTLINE_SYSTEM = `You are a curriculum architect. Output ONLY compact JSON. No prose, no code fences, no markdown.

Emit the UNITS of a syllabus and nothing else. No topics.

Schema (use exactly these keys):
{"u":[{"t":"unit title","s":"one-line scope","w":1-5,"q":["youtube search query"]}]}

t  unit title, in the words a learner would recognise
s  one plain sentence naming what this unit covers
w  weight 1-5: real exam weightage, or importance to the target role
q  ONE natural search query that would surface good video lectures for this unit, written as a person would type it into YouTube. No URLs.

Rules:
- Units in TEACHING order: foundations first, dependent material after.
- Cover the FULL scope. For an exam, mirror the official syllabus unit by unit.
- Produce exactly the number of units requested.
- No topics, no dates, no URLs, no book or channel names.`;

export function outlineUser(req: BlueprintRequest): string {
  return `Subject: ${req.subject}
Type: ${req.prepType}
Mastery target: ${req.scope}
Learner level: ${req.level}
Timeline: ${req.weeks} weeks
Total first-pass study budget: ${req.studyHours} hours

Produce EXACTLY ${req.unitTarget} units, in teaching order.

Output the JSON now.`;
}

export const OUTLINE_SCHEMA_HINT = '{"u":[{"t":"string","s":"string","w":3,"q":["string"]}]}';

/**
 * Topics for one slice of the outline.
 *
 * The full unit list is included as context so a shard knows what the *other*
 * shards are covering and does not duplicate their material — the main failure
 * mode of generating a syllabus in pieces.
 *
 * `dep` is local to the shard: a shard cannot know the global ordinal of a
 * topic another shard has not produced yet. The merge step offsets these into
 * global indices. Cross-shard prerequisites are therefore lost, which costs
 * little — shards are unit-aligned and units are already in teaching order, so
 * almost every real dependency is within a shard.
 */
export const TOPICS_SYSTEM = `You are a curriculum architect who designs for real learners, not for catalogues. Output ONLY compact JSON. No prose, no code fences, no markdown.

You are given the full unit list of a syllabus and asked to write the topics for SOME of those units. Return only the units you were asked about, in the order given.

Schema (use exactly these keys):
{"u":[{"t":"unit title exactly as given","tp":[{"t":"topic title","s":"one line: what this topic is","o":["observable outcome"],"k":["keyword"],"m":60,"d":1-5,"w":1-5,"dep":[]}]}]}

Field meanings:
tp  topics inside the unit, in teaching order
t   topic title      s  one plain sentence a beginner understands
o   1-2 outcomes, each starting with a verb ("Derive...", "Implement...", "Distinguish...")
k   3-6 lowercase keywords/synonyms used to match this topic to real resources. Include the terms practitioners actually use, including acronyms.
m   estimated MINUTES of first-pass study for a learner at the stated level
d   conceptual difficulty 1-5
w   importance 1-5
dep 1-based positions WITHIN YOUR OWN RESPONSE, counting topics in the order you emit them, that must be understood first. Usually [] or one entry. Never reference a later position.

LEARNER RULES — these decide whether the plan gets used at all
- ONE IDEA PER TOPIC. If a title needs "and", or "introduction to X and Y", it is two topics. Split it.
- SIZE FOR A SITTING. m must be between ${TOPIC_MIN_MINUTES} and ${TOPIC_MAX_MINUTES}; aim for 40-75. Anything a learner cannot finish in one or two sittings must be split into separate topics, not estimated larger.
- RAMP THE DIFFICULTY. Inside every unit, d generally increases. Never open a unit at d=5.
- WRITE TITLES A LEARNER RECOGNISES BEFORE STUDYING. Specific and searchable, but in the words a learner would use: "Setup and hold time violations", not "Temporal constraint analysis in synchronous digital systems". Never "Timing concepts".
- o are outcomes the learner could actually check themselves on. "Calculate the propagation delay of a 3-stage chain", not "Understand delay".
- BE HONEST ABOUT m. A genuinely hard idea gets 90-120 and a separate follow-up topic for practice depth; a light one gets 25-40. Do not pad and do not compress.
- Do NOT cover material belonging to a unit you were not asked about.
- No URLs, no channel names, no book titles, no dates, no day numbers.`;

export function topicsUser(params: {
  req: BlueprintRequest;
  /** Every unit title, so the shard knows the boundaries of its own remit. */
  allUnitTitles: string[];
  /** The units this shard must produce topics for. */
  shardUnits: Array<{ t: string; s?: string; w?: number }>;
  /** Topic budget for this shard. */
  topicTarget: number;
  /** True for the shard containing unit 1. */
  isFirstShard: boolean;
}): string {
  const { req, allUnitTitles, shardUnits, topicTarget, isFirstShard } = params;

  const averageMinutes = Math.round(
    (req.studyHours * 60 * (topicTarget / Math.max(1, req.topicTarget))) / Math.max(1, topicTarget),
  );

  return `Subject: ${req.subject}
Type: ${req.prepType}
Learner level: ${req.level}
Mastery target: ${req.scope}

Full unit list for this syllabus, in teaching order:
${allUnitTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}

Write topics for ONLY these units:
${shardUnits.map((u) => `- ${u.t}${u.s ? ` — ${u.s}` : ''}${u.w ? ` (weight ${u.w}/5)` : ''}`).join('\n')}

Produce EXACTLY ${topicTarget} topics in total across those units, distributed by weight.
The m values should average about ${averageMinutes} minutes and must each stay within ${TOPIC_MIN_MINUTES}-${TOPIC_MAX_MINUTES}.

${levelGuidance(req.level)}
${
  isFirstShard
    ? 'START WITH WINS: the first 2-3 topics of the first unit must be d=1 or d=2 — something a nervous beginner can complete on day one.'
    : ''
}

Output the JSON now.`;
}

export const TOPICS_SCHEMA_HINT =
  '{"u":[{"t":"string","tp":[{"t":"string","s":"string","o":["string"],"k":["string"],"m":60,"d":3,"w":3,"dep":[]}]}]}';

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
 *
 * The minute clamp is here rather than only in the prompt because a prompt
 * constraint is a request. A model that ignores it and returns m=300 produces
 * a topic the learner meets as five consecutive blocks of the same title, which
 * reads as a plan that has stalled.
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
            m: clampMinutes(t.m),
            d: t.d === undefined ? undefined : Number(t.d),
            w: t.w === undefined ? undefined : Number(t.w),
            // Positive integers only. `Number(null)` is 0 and 0 is finite, so
            // a null in the list used to survive as dependency "0" — which is
            // not a valid 1-based ordinal and pointed one topic before the
            // first one.
            dep: asArray<unknown>(t.dep)
              .map(Number)
              .filter((d) => Number.isInteger(d) && d >= 1),
          })),
      })),
  };
}

function clampMinutes(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return undefined;
  return Math.max(TOPIC_MIN_MINUTES, Math.min(TOPIC_MAX_MINUTES, Math.round(minutes)));
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

/**
 * Level-specific guidance.
 *
 * The same subject taught to a beginner and to an experienced practitioner
 * needs different *granularity*, not just different depth: a beginner needs
 * smaller steps and more of them, while an advanced learner is insulted by
 * being walked through what they already do daily.
 */
function levelGuidance(level: string): string {
  const normalised = level.toLowerCase();

  if (normalised.startsWith('advanced')) {
    return 'This learner already works in the area. Skip orientation material, assume the vocabulary, and spend the budget on the hard and commonly-failed parts. Topics can sit at d=3-5 from the start of unit 2 onward.';
  }
  if (normalised.startsWith('inter')) {
    return 'This learner knows the basics but has gaps. Do not re-teach foundations from zero — name them briefly and move to the parts people actually get wrong. Keep m near 45-75.';
  }
  return 'This learner is starting fresh. Steps must be small: prefer more topics of 30-60 minutes over fewer long ones. Introduce vocabulary before using it, and make the first day genuinely easy.';
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

  // The per-topic average is stated explicitly because a model given only a
  // total budget and a topic count reliably gets the division wrong, then
  // resolves the mismatch by inflating individual estimates.
  const averageMinutes = Math.round((req.studyHours * 60) / Math.max(1, req.topicTarget));

  return `Subject: ${req.subject}
Type: ${req.prepType}
Mastery target: ${req.scope}
Learner level: ${req.level}
Timeline: ${req.weeks} weeks
Total first-pass study budget: ${req.studyHours} hours
${extras ? `\nLearner specifics:\n${extras}` : ''}

Produce ${req.unitTarget} units containing EXACTLY ${req.topicTarget} topics in total.
The m values should average about ${averageMinutes} minutes and must each stay within ${TOPIC_MIN_MINUTES}-${TOPIC_MAX_MINUTES}.

${focus}
${levelGuidance(req.level)}

Output the JSON now.`;
}

export const BLUEPRINT_SCHEMA_HINT =
  '{"u":[{"t":"string","s":"string","w":3,"q":["string"],"tp":[{"t":"string","s":"string","o":["string"],"k":["string"],"m":60,"d":3,"w":3,"dep":[]}]}]}';
