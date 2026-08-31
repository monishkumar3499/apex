import { describe, it, expect } from 'vitest';
import { buildSchedule, type SchedInput, type SchedTopic } from './scheduler';
import { buildCalendar } from './calendar';
import { schedule as sm2, INITIAL_REVIEW } from './spaced';

function topics(count: number, over = (i: number) => ({})): SchedTopic[] {
  return Array.from({ length: count }, (_, i) => ({
    idx: i,
    unitIdx: Math.floor(i / 5),
    title: `Topic ${i + 1}`,
    estMinutes: 90,
    difficulty: 3,
    weight: 3,
    dependsOn: [],
    ...over(i),
  }));
}

function input(over: Partial<SchedInput> = {}): SchedInput {
  const count = over.topics?.length ?? 20;
  return {
    startDate: '2026-01-05',
    targetDate: '2026-04-05',
    weekdayMinutes: 120,
    weekendMinutes: 240,
    restDays: [],
    prepType: 'exam',
    units: Array.from({ length: Math.ceil(count / 5) }, (_, i) => ({ idx: i, title: `Unit ${i + 1}` })),
    topics: topics(count),
    ...over,
  };
}

describe('calendar', () => {
  it('skips rest days and assigns weekend capacity', () => {
    const days = buildCalendar({
      startDate: '2026-01-05', // Monday
      targetDate: '2026-01-18',
      weekdayMinutes: 100,
      weekendMinutes: 300,
      restDays: [0], // no Sundays
    });

    expect(days.every((d) => new Date(`${d.date}T00:00:00Z`).getUTCDay() !== 0)).toBe(true);
    const saturday = days.find((d) => new Date(`${d.date}T00:00:00Z`).getUTCDay() === 6);
    expect(saturday?.capacity).toBe(300);
    expect(days.find((d) => !d.isWeekend)?.capacity).toBe(100);
  });

  it('always reserves a final revision block', () => {
    const days = buildCalendar({
      startDate: '2026-01-05',
      targetDate: '2026-07-05',
      weekdayMinutes: 120,
      weekendMinutes: 240,
      restDays: [],
    });
    expect(days.filter((d) => d.isFinalStretch).length).toBeGreaterThanOrEqual(2);
    // The final block is contiguous and at the end.
    const firstFinal = days.findIndex((d) => d.isFinalStretch);
    expect(days.slice(firstFinal).every((d) => d.isFinalStretch)).toBe(true);
  });
});

describe('buildSchedule', () => {
  it('never schedules more minutes than a day has capacity', () => {
    const result = buildSchedule(input());
    for (const session of result.sessions) {
      const dow = new Date(`${session.date}T00:00:00Z`).getUTCDay();
      const capacity = dow === 0 || dow === 6 ? 240 : 120;
      expect(session.plannedMinutes).toBeLessThanOrEqual(capacity);
      expect(session.plannedMinutes).toBe(
        session.items.reduce((s, i) => s + i.estMinutes, 0),
      );
    }
  });

  it('teaches prerequisites before dependents', () => {
    const deps = topics(12).map((t, i) => ({
      ...t,
      // Topic 1 depends on topic 9; topic 3 depends on topic 11.
      dependsOn: i === 0 ? [8] : i === 2 ? [10] : [],
    }));

    const result = buildSchedule(input({ topics: deps }));
    const firstLearnDay = new Map<number, number>();
    for (const session of result.sessions) {
      for (const item of session.items) {
        if (item.kind !== 'learn' || item.topicIdx === null) continue;
        if (!firstLearnDay.has(item.topicIdx)) firstLearnDay.set(item.topicIdx, session.dayIndex);
      }
    }

    expect(firstLearnDay.get(8)!).toBeLessThanOrEqual(firstLearnDay.get(0)!);
    expect(firstLearnDay.get(10)!).toBeLessThanOrEqual(firstLearnDay.get(2)!);
  });

  it('revisits every taught topic at least once', () => {
    const result = buildSchedule(input({ topics: topics(15) }));

    const taught = new Set<number>();
    const reviewed = new Set<number>();
    for (const session of result.sessions) {
      for (const item of session.items) {
        if (item.topicIdx === null) continue;
        if (item.kind === 'learn') taught.add(item.topicIdx);
        if (item.kind === 'review') reviewed.add(item.topicIdx);
      }
    }

    expect(taught.size).toBeGreaterThan(0);
    for (const idx of taught) expect(reviewed.has(idx)).toBe(true);
  });

  it('defers low-value topics instead of compressing an impossible plan', () => {
    // 60 topics × 4h in a 3-week window at 2h/day cannot fit.
    const heavy = topics(60, (i) => ({ estMinutes: 240, weight: i < 10 ? 5 : 1 }));
    const result = buildSchedule(
      input({ topics: heavy, startDate: '2026-01-05', targetDate: '2026-01-26' }),
    );

    expect(result.deferredTopics.length).toBeGreaterThan(0);
    expect(result.stats.compression).toBeGreaterThanOrEqual(0.55);

    // High-weight topics survive; the dropped ones are the weight-1 tail.
    const kept = new Set(
      result.sessions.flatMap((s) => s.items.map((i) => i.topicIdx).filter((i): i is number => i !== null)),
    );
    const highValueKept = heavy.slice(0, 10).filter((t) => kept.has(t.idx)).length;
    expect(highValueKept).toBeGreaterThan(5);
  });

  it('schedules mocks and a final readiness check', () => {
    const result = buildSchedule(input({ prepType: 'exam' }));
    const kinds = result.sessions.flatMap((s) => s.items.map((i) => i.kind));

    expect(kinds.filter((k) => k === 'mock').length).toBeGreaterThanOrEqual(2);
    expect(kinds).toContain('assess');
    expect(result.mockDays.length).toBe(result.mockDays.length);

    // Mocks land in the back half, where there is material worth testing.
    const total = result.sessions.length;
    for (const day of result.mockDays) expect(day / total).toBeGreaterThan(0.35);
  });

  it('schedules no new material on catch-up days', () => {
    const result = buildSchedule(input({ startDate: '2026-01-05', targetDate: '2026-06-05' }));
    const catchUps = result.sessions.filter((s) => s.items.some((i) => i.kind === 'buffer'));

    expect(catchUps.length).toBeGreaterThan(0);
    for (const session of catchUps) {
      expect(session.items.some((i) => i.kind === 'learn')).toBe(false);
    }
  });

  it('gives exam prep more practice than skill prep', () => {
    const practiceMinutes = (prepType: SchedInput['prepType']) => {
      const result = buildSchedule(input({ prepType, topics: topics(12) }));
      return result.sessions
        .flatMap((s) => s.items)
        .filter((i) => i.kind === 'practice' || i.kind === 'project')
        .reduce((s, i) => s + i.estMinutes, 0);
    };

    expect(practiceMinutes('exam')).toBeGreaterThan(practiceMinutes('skill'));
  });

  it('degrades safely on empty or impossible input', () => {
    expect(buildSchedule(input({ topics: [] })).sessions).toHaveLength(0);

    const sameDay = buildSchedule(
      input({ startDate: '2026-01-05', targetDate: '2026-01-06', topics: topics(3) }),
    );
    expect(sameDay.sessions.length).toBeLessThanOrEqual(2);
  });

  it('produces a plan whose every item is reachable and non-empty', () => {
    const result = buildSchedule(input({ topics: topics(30) }));
    expect(result.stats.itemCount).toBeGreaterThan(30);

    for (const session of result.sessions) {
      expect(session.items.length).toBeGreaterThan(0);
      expect(session.headline).toBeTruthy();
      for (const item of session.items) {
        expect(item.title.trim()).not.toBe('');
        expect(item.estMinutes).toBeGreaterThan(0);
      }
    }
  });
});

describe('sm-2', () => {
  it('resets the interval on a failure but keeps ease above the floor', () => {
    let state = INITIAL_REVIEW;
    state = sm2(state, 5);
    state = sm2(state, 5);
    state = sm2(state, 5);
    expect(state.intervalDays).toBeGreaterThan(6);

    const lapsed = sm2(state, 1);
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.ease).toBeGreaterThanOrEqual(1.3);
  });

  it('expands intervals for consistently easy cards', () => {
    let state = INITIAL_REVIEW;
    const seen: number[] = [];
    for (let i = 0; i < 5; i++) {
      state = sm2(state, 5);
      seen.push(state.intervalDays);
    }
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    expect(state.ease).toBeGreaterThan(2.5);
  });

  it('never lets ease fall below 1.3 no matter how many lapses', () => {
    let state = INITIAL_REVIEW;
    for (let i = 0; i < 30; i++) state = sm2(state, 0);
    expect(state.ease).toBe(1.3);
  });
});
