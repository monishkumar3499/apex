import { addDays, dayOfWeek, diffDays } from './calendar';

/**
 * How much time a plan actually needs before it is worth building.
 *
 * The old rule was per-day, and wrong in both directions: it demanded at least
 * 15 minutes on a *weekday* while allowing 0 at the weekend, so "I only study
 * at weekends" was rejected and "20 minutes a week for a year" was accepted.
 *
 * Neither kind of day is special. Two things actually matter:
 *
 *   1. **The total covers a minimum viable syllabus.** Below that the scheduler
 *      defers most of the material and hands back a plan that is mostly marked
 *      optional — technically honest, practically useless.
 *   2. **At least one study day is long enough to hold one topic.** A plan made
 *      of 10-minute days cannot contain a 45-minute topic however many days it
 *      has; the work would be split into fragments that teach nothing.
 *
 * Either weekday or weekend minutes may therefore be zero. Both cannot.
 */

export type PrepType = 'exam' | 'skill' | 'hybrid';

/**
 * The average topic, in minutes, as the blueprint prompts are tuned to produce
 * them. Used to convert "enough topics" into "enough minutes".
 */
const MINUTES_PER_TOPIC = 45;

/**
 * Review and assessment overhead, as a multiple of teaching time.
 *
 * Every topic returns at 2, 7 and 21 days, and unit checkpoints plus mocks sit
 * on top of that. A minimum computed from first-pass teaching time alone would
 * be about a third short of what the scheduler actually places.
 */
const REVIEW_MULTIPLIER = 1.5;

/**
 * The fewest topics that still make a plan worth having, per prep type.
 *
 * An exam is a breadth problem — a syllabus with twelve topics in it is not a
 * syllabus. A skill is a depth problem, so fewer, longer topics are legitimate.
 * Hybrid carries both a certification blueprint and role competence.
 */
const MIN_TOPICS: Record<PrepType, number> = {
  exam: 20,
  skill: 15,
  hybrid: 24,
};

/**
 * Level discount.
 *
 * An advanced learner genuinely can skip fundamentals, so holding them to a
 * beginner's hours would be a false gate. This discounts the *minimum*, never
 * the plan — the scheduler still spends every minute it is given.
 */
function levelFactor(level: string): number {
  const l = (level ?? '').toLowerCase();
  if (l.startsWith('adv') || l.includes('expert')) return 0.7;
  if (l.startsWith('inter')) return 0.85;
  return 1;
}

/**
 * A weekly contact floor, independent of the total.
 *
 * Spaced repetition returns material at 2, 7 and 21 days. Someone who shows up
 * once a fortnight never meets a review on its due date, so the schedule
 * degrades to first-exposure-only however many total hours it adds up to.
 * Thirty minutes a week is where that stops working at all.
 */
const MINUTES_PER_WEEK_FLOOR = 30;

/** The shortest session that can hold a single topic without fragmenting it. */
export const MIN_SESSION_MINUTES = 30;

export interface MinimumInput {
  prepType: PrepType;
  level: string;
  /** Whole weeks between start and target. */
  weeks: number;
}

/**
 * The bare minimum total study minutes for this course.
 *
 * Deliberately a *floor*, not a recommendation: it is the point below which the
 * scheduler cannot produce a plan the learner could follow to a useful end, and
 * saying so up front beats building one and marking most of it optional.
 */
export function minimumMinutes({ prepType, level, weeks }: MinimumInput): number {
  const topics = MIN_TOPICS[prepType] ?? MIN_TOPICS.skill;
  const syllabusFloor = topics * MINUTES_PER_TOPIC * REVIEW_MULTIPLIER * levelFactor(level);
  const contactFloor = Math.max(1, weeks) * MINUTES_PER_WEEK_FLOOR;

  // Whichever floor binds. A four-week plan is gated by the syllabus; a
  // year-long one by weekly contact.
  return Math.round(Math.max(syllabusFloor, contactFloor));
}

export interface BudgetInput {
  startDate: string;
  targetDate: string;
  weekdayMinutes: number;
  weekendMinutes: number;
  restDays: number[];
  maxDays?: number;
}

/**
 * Total minutes the learner's stated availability adds up to.
 *
 * Walks the real calendar rather than multiplying an average week, because rest
 * days, a mid-week start and an odd-length final week together shift the answer
 * by more than the rounding suggests. This is the same walk `buildCalendar`
 * does, and a day with zero configured minutes is skipped by both.
 */
export function totalAvailableMinutes({
  startDate,
  targetDate,
  weekdayMinutes,
  weekendMinutes,
  restDays,
  maxDays = 540,
}: BudgetInput): number {
  const rest = new Set(restDays);
  const span = Math.max(0, diffDays(startDate, targetDate));
  let total = 0;
  let counted = 0;

  for (let offset = 0; offset <= span && counted < maxDays; offset++) {
    const dow = dayOfWeek(addDays(startDate, offset));
    if (rest.has(dow)) continue;

    counted++;
    const isWeekend = dow === 0 || dow === 6;
    total += isWeekend ? Math.max(0, weekendMinutes) : Math.max(0, weekdayMinutes);
  }

  return total;
}

export type CapacityFailure = 'no-session' | 'below-minimum';

export interface CapacityVerdict {
  ok: boolean;
  /** Minutes the learner's answers add up to across the whole timeline. */
  totalMinutes: number;
  /** The computed floor for this course. */
  minimumMinutes: number;
  /** The longest single study day configured, after rest days. */
  longestSession: number;
  reason?: CapacityFailure;
  /** A sentence that can be shown to the learner verbatim. */
  message?: string;
}

const hours = (minutes: number) => Math.max(1, Math.round(minutes / 60));

/**
 * Can a useful plan be built from these answers?
 *
 * Returns a verdict rather than throwing, so the intake wizard and the API
 * apply exactly the same rule — the wizard to explain why Continue is disabled,
 * the route to reject a request that bypassed it.
 */
export function checkCapacity(input: BudgetInput & MinimumInput): CapacityVerdict {
  const totalMinutes = totalAvailableMinutes(input);
  const floor = minimumMinutes(input);

  // A rest day removes that weekday from the week entirely, so the longest
  // session is whichever kind of day actually survives.
  const rest = new Set(input.restDays);
  const weekdaySurvives = [1, 2, 3, 4, 5].some((d) => !rest.has(d));
  const weekendSurvives = [0, 6].some((d) => !rest.has(d));

  const longestSession = Math.max(
    weekdaySurvives ? Math.max(0, input.weekdayMinutes) : 0,
    weekendSurvives ? Math.max(0, input.weekendMinutes) : 0,
  );

  if (longestSession < MIN_SESSION_MINUTES) {
    return {
      ok: false,
      totalMinutes,
      minimumMinutes: floor,
      longestSession,
      reason: 'no-session',
      message:
        `At least one kind of day needs ${MIN_SESSION_MINUTES} minutes or more — ` +
        `a topic does not fit in less, so the plan would be split into fragments. ` +
        `Weekdays or weekends can be zero, just not both.`,
    };
  }

  if (totalMinutes < floor) {
    return {
      ok: false,
      totalMinutes,
      minimumMinutes: floor,
      longestSession,
      reason: 'below-minimum',
      message:
        `That adds up to about ${hours(totalMinutes)}h, and this goal needs roughly ` +
        `${hours(floor)}h as a bare minimum. Add time per day or move the target ` +
        `date back — otherwise most of the material would be deferred and marked ` +
        `optional rather than taught.`,
    };
  }

  return { ok: true, totalMinutes, minimumMinutes: floor, longestSession };
}
