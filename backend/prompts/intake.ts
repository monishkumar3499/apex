/**
 * Stage 1 — Intake classifier.
 *
 * Cheapest call in the pipeline (~250 in / ~180 out on the nano tier). It
 * decides which blueprint the plan uses and asks at most two goal-specific
 * follow-ups, so the wizard adapts without a second round trip.
 */

export const INTAKE_SYSTEM = `You classify study goals. Output ONLY compact JSON. No prose, no code fences.

Schema:
{"pt":"exam|skill|hybrid","sub":"canonical subject name","slug":"kebab-case-id","lvl":"beginner|intermediate|advanced","conf":0.0-1.0,"scope":"one sentence naming what mastery means here","ask":[{"id":"snake_id","q":"question","opts":["opt1","opt2","opt3"]}]}

Rules:
- pt="exam" for a named test with a fixed syllabus (GATE, JEE, NEET, GRE, CAT, UPSC, CFA, AWS/Azure certs, USMLE, LeetCode-style hiring screens).
- pt="skill" for a role or capability (become an ASIC design engineer, learn React, ML engineering).
- pt="hybrid" when a certification gates a role (e.g. "AWS Solutions Architect to become a cloud engineer").
- sub: expand abbreviations to the full canonical name. "gate ece" -> "GATE Electronics and Communication Engineering".
- slug: lowercase kebab-case, stable across phrasings of the same goal.
- lvl: infer from the user's words; default "beginner" when unstated.
- ask: 0-2 questions that would MATERIALLY change the plan and are not already answered by the user's input. Each needs 2-4 concrete options. Ask about specialisation, target tier, or exam paper only when it genuinely branches the syllabus. Return [] when nothing important is missing.
- Never ask about hours per day, deadline, or current level — already collected.`;

export interface IntakeQuestion {
  id: string;
  q: string;
  opts: string[];
}

export interface IntakeResult {
  pt: 'exam' | 'skill' | 'hybrid';
  sub: string;
  slug: string;
  lvl: string;
  conf: number;
  scope: string;
  ask: IntakeQuestion[];
  /**
   * True when classification failed and this is the generic fallback rather
   * than a real judgement. Carried through plan creation so the build records
   * it, instead of a dead nano model looking like a confident "skill" verdict.
   */
  degraded?: boolean;
  /** Why classification fell back. Present only when `degraded`. */
  degradedReason?: string;
}

export function intakeUser(goal: string, level: string, weeks: number, hoursPerWeek: number): string {
  return `Goal: "${goal}"
Stated level: ${level}
Timeline: ${weeks} weeks
Weekly capacity: ${hoursPerWeek} hours`;
}

export const INTAKE_SCHEMA_HINT =
  '{"pt":"exam|skill|hybrid","sub":"string","slug":"string","lvl":"string","conf":0.9,"scope":"string","ask":[{"id":"string","q":"string","opts":["string"]}]}';
