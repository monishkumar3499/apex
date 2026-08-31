/**
 * SM-2 spaced repetition, used by the drill engine.
 *
 * Grades follow the original SuperMemo scale:
 *   0 blackout · 1 wrong, familiar · 2 wrong, easy recall on seeing answer
 *   3 correct, hard · 4 correct, some hesitation · 5 correct, instant
 * The UI collapses this to four buttons (Again / Hard / Good / Easy).
 */

export interface ReviewState {
  ease: number;          // E-Factor, floor 1.3
  intervalDays: number;
  repetitions: number;
  lapses: number;
}

export interface ReviewOutcome extends ReviewState {
  dueInDays: number;
}

export const INITIAL_REVIEW: ReviewState = { ease: 2.5, intervalDays: 0, repetitions: 0, lapses: 0 };

/** Map the 4-button UI onto the 0..5 SM-2 scale. */
export const GRADE_FROM_BUTTON = { again: 1, hard: 3, good: 4, easy: 5 } as const;
export type GradeButton = keyof typeof GRADE_FROM_BUTTON;

export function schedule(state: ReviewState, grade: number): ReviewOutcome {
  const g = Math.max(0, Math.min(5, Math.round(grade)));

  // Failure resets the interval but preserves a dampened ease.
  if (g < 3) {
    const ease = Math.max(1.3, state.ease - 0.2);
    return { ease, intervalDays: 1, repetitions: 0, lapses: state.lapses + 1, dueInDays: 1 };
  }

  const ease = Math.max(1.3, state.ease + (0.1 - (5 - g) * (0.08 + (5 - g) * 0.02)));
  const repetitions = state.repetitions + 1;

  let intervalDays: number;
  if (repetitions === 1) intervalDays = 1;
  else if (repetitions === 2) intervalDays = 6;
  else intervalDays = Math.round(state.intervalDays * ease);

  // Cap so a long plan still surfaces everything at least a few times.
  intervalDays = Math.min(intervalDays, 180);

  return { ease, intervalDays, repetitions, lapses: state.lapses, dueInDays: intervalDays };
}

/**
 * Topic mastery, 0..100.
 *
 * Blends recent accuracy with how far the material has been pushed out by the
 * scheduler — a card answered right once is not mastery, a card at a 40-day
 * interval is.
 */
export function masteryFrom(reviews: ReviewState[], accuracy: number): number {
  if (!reviews.length) return Math.round(accuracy * 40);

  const avgInterval = reviews.reduce((s, r) => s + r.intervalDays, 0) / reviews.length;
  const retention = Math.min(1, avgInterval / 30);
  const stability = Math.min(1, reviews.reduce((s, r) => s + r.repetitions, 0) / (reviews.length * 4));
  const lapseRate = reviews.reduce((s, r) => s + r.lapses, 0) / Math.max(1, reviews.length);
  const penalty = Math.min(0.3, lapseRate * 0.08);

  return Math.round(
    Math.max(0, Math.min(1, accuracy * 0.5 + retention * 0.3 + stability * 0.2 - penalty)) * 100,
  );
}
