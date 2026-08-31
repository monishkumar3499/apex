/** UTC-safe date helpers. All plan dates are 'YYYY-MM-DD' strings. */

export const toDate = (iso: string): Date => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
export const fmtDate = (d: Date): string => d.toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string =>
  fmtDate(new Date(toDate(iso).getTime() + n * 86_400_000));
export const dayOfWeek = (iso: string): number => toDate(iso).getUTCDay(); // 0=Sun
export const diffDays = (a: string, b: string): number =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
export const todayIso = (): string => fmtDate(new Date());

export interface CalendarDay {
  dayIndex: number;
  date: string;
  capacity: number;
  isWeekend: boolean;
  /** Consolidation days carry no new material — they absorb slippage. */
  isCatchUp: boolean;
  /** Reserved end-of-plan revision block. */
  isFinalStretch: boolean;
}

export interface CalendarOptions {
  startDate: string;
  targetDate: string;
  weekdayMinutes: number;
  weekendMinutes: number;
  restDays: number[];
  /** Every Nth study day becomes a catch-up day. 0 disables. */
  catchUpEvery?: number;
  /** Fraction of the plan reserved for final revision. */
  finalStretchRatio?: number;
  maxDays?: number;
}

/**
 * Build the study calendar.
 *
 * Two structural decisions live here and they are what stop a generated plan
 * from collapsing the first time real life intervenes:
 *   1. a catch-up day every two weeks that schedules no new material, and
 *   2. a reserved final-revision block that is never consumed by new topics.
 */
export function buildCalendar(options: CalendarOptions): CalendarDay[] {
  const {
    startDate,
    targetDate,
    weekdayMinutes,
    weekendMinutes,
    restDays,
    catchUpEvery = 14,
    finalStretchRatio = 0.09,
    maxDays = 540,
  } = options;

  const rest = new Set(restDays);
  const span = Math.max(1, diffDays(startDate, targetDate));
  const days: CalendarDay[] = [];

  for (let offset = 0; offset <= span && days.length < maxDays; offset++) {
    const date = addDays(startDate, offset);
    const dow = dayOfWeek(date);
    if (rest.has(dow)) continue;

    const isWeekend = dow === 0 || dow === 6;
    days.push({
      dayIndex: days.length + 1,
      date,
      capacity: Math.max(15, isWeekend ? weekendMinutes : weekdayMinutes),
      isWeekend,
      isCatchUp: false,
      isFinalStretch: false,
    });
  }

  if (!days.length) return days;

  const finalCount = Math.min(
    Math.max(2, Math.round(days.length * finalStretchRatio)),
    Math.max(2, Math.floor(days.length * 0.25)),
    21,
  );

  days.forEach((day, i) => {
    day.isFinalStretch = i >= days.length - finalCount;
    day.isCatchUp =
      !day.isFinalStretch && catchUpEvery > 0 && day.dayIndex % catchUpEvery === 0;
  });

  return days;
}

/** Minutes available for brand-new material (excludes catch-up + final block). */
export function teachingCapacity(days: CalendarDay[]): number {
  return days
    .filter((d) => !d.isCatchUp && !d.isFinalStretch)
    .reduce((sum, d) => sum + d.capacity, 0);
}
