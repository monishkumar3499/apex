import { describe, it, expect } from 'vitest';
import {
  checkCapacity,
  minimumMinutes,
  totalAvailableMinutes,
  MIN_SESSION_MINUTES,
} from './capacity';
import { buildCalendar } from './calendar';

/** A Monday, so weekday/weekend arithmetic is easy to reason about. */
const MONDAY = '2026-01-05';
const iso = (daysFromMonday: number) => {
  const d = new Date(`${MONDAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + daysFromMonday);
  return d.toISOString().slice(0, 10);
};

describe('minimumMinutes', () => {
  it('asks more of an exam than of a skill, because breadth is the problem', () => {
    const base = { level: 'beginner', weeks: 8 } as const;
    expect(minimumMinutes({ ...base, prepType: 'exam' })).toBeGreaterThan(
      minimumMinutes({ ...base, prepType: 'skill' }),
    );
    expect(minimumMinutes({ ...base, prepType: 'hybrid' })).toBeGreaterThan(
      minimumMinutes({ ...base, prepType: 'exam' }),
    );
  });

  it('discounts the floor for an advanced learner, who can skip fundamentals', () => {
    const base = { prepType: 'exam' as const, weeks: 8 };
    const beginner = minimumMinutes({ ...base, level: 'beginner' });
    const intermediate = minimumMinutes({ ...base, level: 'intermediate' });
    const advanced = minimumMinutes({ ...base, level: 'advanced' });

    expect(intermediate).toBeLessThan(beginner);
    expect(advanced).toBeLessThan(intermediate);
  });

  it('is bound by the syllabus on a short plan', () => {
    // Four weeks of weekly-contact floor is 120 minutes — far below the
    // syllabus requirement, so the syllabus is what binds.
    const short = minimumMinutes({ prepType: 'exam', level: 'beginner', weeks: 4 });
    expect(short).toBeGreaterThan(4 * 30);
    expect(short).toBe(minimumMinutes({ prepType: 'exam', level: 'beginner', weeks: 1 }));
  });

  it('is bound by weekly contact on a long plan', () => {
    // A year at 30 min/week exceeds the syllabus floor, so the total has to
    // grow with the timeline — otherwise a 52-week plan could be "valid" with
    // the same hours as a 4-week one and never meet a review on its due date.
    const year = minimumMinutes({ prepType: 'skill', level: 'advanced', weeks: 52 });
    expect(year).toBe(52 * 30);
  });

  it('never returns zero or a negative, whatever it is handed', () => {
    expect(minimumMinutes({ prepType: 'skill', level: '', weeks: 0 })).toBeGreaterThan(0);
    expect(minimumMinutes({ prepType: 'skill', level: '', weeks: -5 })).toBeGreaterThan(0);
  });
});

describe('totalAvailableMinutes', () => {
  it('walks the real calendar rather than an average week', () => {
    // Mon–Sun inclusive: 5 weekdays at 60 + 2 weekend days at 120.
    const total = totalAvailableMinutes({
      startDate: MONDAY,
      targetDate: iso(6),
      weekdayMinutes: 60,
      weekendMinutes: 120,
      restDays: [],
    });
    expect(total).toBe(5 * 60 + 2 * 120);
  });

  it('counts a weekend-only learner correctly, with weekdays at zero', () => {
    const total = totalAvailableMinutes({
      startDate: MONDAY,
      targetDate: iso(13),
      weekdayMinutes: 0,
      weekendMinutes: 300,
      restDays: [],
    });
    // Two weeks, four weekend days.
    expect(total).toBe(4 * 300);
  });

  it('excludes rest days entirely', () => {
    const total = totalAvailableMinutes({
      startDate: MONDAY,
      targetDate: iso(6),
      weekdayMinutes: 60,
      weekendMinutes: 120,
      restDays: [0, 6],
    });
    expect(total).toBe(5 * 60);
  });

  it('treats a negative as zero rather than subtracting time', () => {
    const total = totalAvailableMinutes({
      startDate: MONDAY,
      targetDate: iso(6),
      weekdayMinutes: -60,
      weekendMinutes: 120,
      restDays: [],
    });
    expect(total).toBe(2 * 120);
  });
});

describe('checkCapacity', () => {
  const sixMonths = {
    startDate: MONDAY,
    targetDate: '2026-07-06',
    restDays: [],
    prepType: 'exam' as const,
    level: 'beginner',
    weeks: 26,
  };

  it('accepts a weekend-only learner with real weekend hours', () => {
    // The headline case: weekdayMinutes of 0 must be legal.
    const verdict = checkCapacity({ ...sixMonths, weekdayMinutes: 0, weekendMinutes: 360 });
    expect(verdict.ok).toBe(true);
    expect(verdict.longestSession).toBe(360);
  });

  it('accepts a weekday-only learner with weekends at zero', () => {
    const verdict = checkCapacity({ ...sixMonths, weekdayMinutes: 120, weekendMinutes: 0 });
    expect(verdict.ok).toBe(true);
  });

  it('rejects both at zero, and says which rule failed', () => {
    const verdict = checkCapacity({ ...sixMonths, weekdayMinutes: 0, weekendMinutes: 0 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('no-session');
    expect(verdict.message).toMatch(/just not both/);
  });

  it('rejects a plan whose only sessions are too short to hold a topic', () => {
    // 20 minutes a day for six months is ~60 hours — over the total floor, and
    // still useless, because no single session can contain a 45-minute topic.
    const verdict = checkCapacity({ ...sixMonths, weekdayMinutes: 20, weekendMinutes: 20 });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('no-session');
    expect(verdict.totalMinutes).toBeGreaterThan(verdict.minimumMinutes);
  });

  it('accepts exactly at the session floor', () => {
    const verdict = checkCapacity({
      ...sixMonths,
      weekdayMinutes: MIN_SESSION_MINUTES,
      weekendMinutes: 0,
    });
    expect(verdict.longestSession).toBe(MIN_SESSION_MINUTES);
    expect(verdict.reason).not.toBe('no-session');
  });

  it('rejects a long timeline with too few total hours', () => {
    // One 45-minute weekend day a week for six months: sessions are long
    // enough, but ~40 hours does not cover a 20-topic exam syllabus.
    const verdict = checkCapacity({
      ...sixMonths,
      weekdayMinutes: 0,
      weekendMinutes: 45,
      restDays: [0],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('below-minimum');
    expect(verdict.message).toMatch(/bare minimum/);
  });

  it('ignores minutes on a day that is also a rest day', () => {
    // Weekends are the only day with time, and both weekend days are off. The
    // longest *available* session is therefore zero, not 480.
    const verdict = checkCapacity({
      ...sixMonths,
      weekdayMinutes: 0,
      weekendMinutes: 480,
      restDays: [0, 6],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toBe('no-session');
    expect(verdict.longestSession).toBe(0);
  });

  it('reports the numbers it judged on, so the UI can show them', () => {
    const verdict = checkCapacity({ ...sixMonths, weekdayMinutes: 120, weekendMinutes: 240 });
    expect(verdict.totalMinutes).toBeGreaterThan(0);
    expect(verdict.minimumMinutes).toBeGreaterThan(0);
  });
});

describe('buildCalendar with a zero-capacity day kind', () => {
  it('schedules no weekdays at all when weekday minutes are zero', () => {
    // The regression this guards: `Math.max(15, 0)` used to turn "unavailable"
    // into a 15-minute study day, so a weekend-only learner's plan was built
    // mostly out of days they had said they could not study.
    const days = buildCalendar({
      startDate: MONDAY,
      targetDate: iso(27),
      weekdayMinutes: 0,
      weekendMinutes: 300,
      restDays: [],
      catchUpEvery: 0,
    });

    expect(days.length).toBeGreaterThan(0);
    expect(days.every((d) => d.isWeekend)).toBe(true);
    expect(days.every((d) => d.capacity === 300)).toBe(true);
  });

  it('schedules no weekend days when weekend minutes are zero', () => {
    const days = buildCalendar({
      startDate: MONDAY,
      targetDate: iso(27),
      weekdayMinutes: 90,
      weekendMinutes: 0,
      restDays: [],
      catchUpEvery: 0,
    });
    expect(days.every((d) => !d.isWeekend)).toBe(true);
  });

  it('still floors a short but non-zero day, which cannot hold anything', () => {
    const days = buildCalendar({
      startDate: MONDAY,
      targetDate: iso(6),
      weekdayMinutes: 5,
      weekendMinutes: 5,
      restDays: [],
      catchUpEvery: 0,
    });
    expect(days.every((d) => d.capacity === 15)).toBe(true);
  });

  it('returns an empty calendar when nothing is available', () => {
    expect(
      buildCalendar({
        startDate: MONDAY,
        targetDate: iso(27),
        weekdayMinutes: 0,
        weekendMinutes: 0,
        restDays: [],
      }),
    ).toEqual([]);
  });
});
