import { buildCalendar, teachingCapacity, type CalendarDay, type CalendarOptions } from './calendar';

/**
 * The prep-map scheduler.
 *
 * Given topics with time estimates and a learner's real capacity, this lays
 * out an executable day-by-day plan. No model is involved: scheduling is an
 * optimisation problem, and a model asked to "generate 180 days of tasks"
 * produces a shallow, arithmetically wrong plan for a large token bill.
 *
 * What it guarantees that a generated task list does not:
 *   • Total planned minutes never exceed the learner's stated capacity.
 *   • Prerequisites are always taught before dependents (topological order).
 *   • Every topic is revisited at expanding intervals (2 / 7 / 21 days).
 *   • Unit checkpoints and full mocks land at meaningful points.
 *   • Over-subscribed plans defer the least valuable topics instead of
 *     silently compressing everything into uselessness.
 */

export type ItemKind = 'learn' | 'practice' | 'review' | 'project' | 'assess' | 'mock' | 'buffer';

export interface SchedTopic {
  idx: number;
  unitIdx: number;
  title: string;
  estMinutes: number;
  difficulty: number;   // 1..5
  weight: number;       // relative importance / exam weightage
  dependsOn: number[];  // topic idx values
}

export interface SchedUnit {
  idx: number;
  title: string;
}

export interface SchedInput extends CalendarOptions {
  prepType: 'exam' | 'skill' | 'hybrid';
  units: SchedUnit[];
  topics: SchedTopic[];
}

export interface SchedItem {
  topicIdx: number | null;
  kind: ItemKind;
  title: string;
  detail: string;
  estMinutes: number;
  /** Which of the topic's ranked resources to attach (0 = best). */
  resourceRank: number | null;
}

export interface SchedSession {
  dayIndex: number;
  date: string;
  plannedMinutes: number;
  headline: string;
  items: SchedItem[];
}

export interface SchedResult {
  sessions: SchedSession[];
  deferredTopics: number[];
  mockDays: number[];
  /**
   * Days reserved for consolidation, which must never carry new material.
   *
   * Reported explicitly because "has a buffer item" is only a proxy for it —
   * day one also gets a buffer item (the orientation win) and does teach new
   * material, so the invariant needs the real list to be testable.
   */
  catchUpDays: number[];
  stats: {
    studyDays: number;
    totalMinutes: number;
    capacityMinutes: number;
    utilisation: number;
    compression: number;
    itemCount: number;
  };
}

/** Practice-to-learn ratio. Exam prep is problem-solving heavy. */
const PRACTICE_RATIO: Record<SchedInput['prepType'], number> = {
  exam: 0.65,
  skill: 0.45,
  hybrid: 0.55,
};

const REVIEW_OFFSETS = [2, 7, 21];   // expanding-interval consolidation
const REVIEW_MINUTES = 15;
const MIN_CHUNK = 25;                // shorter than this and nothing sticks
const MAX_CHUNK = 90;                // absolute ceiling on one block
const ASSESS_MINUTES = 35;

/**
 * How long a single block of new material may run, by difficulty.
 *
 * A flat 90-minute ceiling treats "list the SI units" and "derive the
 * small-signal model" as the same kind of work. They are not: the harder the
 * material, the sooner attention degrades and the more the learner needs a
 * boundary to stop at. Hard topics therefore arrive as more, shorter blocks
 * with the same total time — same coverage, far higher completion rate.
 */
function maxChunkFor(difficulty: number): number {
  if (difficulty >= 5) return 40;
  if (difficulty >= 4) return 50;
  if (difficulty >= 3) return 65;
  return MAX_CHUNK;
}

/**
 * Distinct new topics a learner may be introduced to in one day.
 *
 * Interleaving helps retention, but only up to a point: a free Saturday with
 * 240 minutes of capacity would otherwise open five unrelated concepts in a
 * row, and nothing consolidates. Beyond the cap the day is filled with
 * practice and review of what is already open instead — which is the more
 * valuable use of the time anyway.
 */
const MAX_NEW_TOPICS_PER_DAY = 3;

/** Kahn topological sort; falls back to declared order on a cycle. */
function orderTopics(topics: SchedTopic[]): SchedTopic[] {
  const byIdx = new Map(topics.map((t) => [t.idx, t]));
  const indegree = new Map<number, number>();
  const dependents = new Map<number, number[]>();

  topics.forEach((t) => {
    const deps = t.dependsOn.filter((d) => byIdx.has(d) && d !== t.idx);
    indegree.set(t.idx, deps.length);
    deps.forEach((d) => dependents.set(d, [...(dependents.get(d) ?? []), t.idx]));
  });

  // Ready topics are drained in declared order so units stay contiguous.
  const ready = topics.filter((t) => (indegree.get(t.idx) ?? 0) === 0).map((t) => t.idx);
  ready.sort((a, b) => a - b);

  const out: SchedTopic[] = [];
  while (ready.length) {
    const idx = ready.shift()!;
    const topic = byIdx.get(idx);
    if (!topic) continue;
    out.push(topic);

    for (const dep of dependents.get(idx) ?? []) {
      const next = (indegree.get(dep) ?? 1) - 1;
      indegree.set(dep, next);
      if (next === 0) {
        ready.push(dep);
        ready.sort((a, b) => a - b);
      }
    }
  }

  if (out.length !== topics.length) {
    const seen = new Set(out.map((t) => t.idx));
    topics.filter((t) => !seen.has(t.idx)).forEach((t) => out.push(t));
  }
  return out;
}

/**
 * Fit demand to capacity.
 *
 * Compression alone is a trap — squeezing 400 hours into 120 produces a plan
 * where nothing gets enough time. So we first defer whole low-value topics
 * (only ones nothing depends on) until the remainder can be compressed by a
 * factor that still leaves each topic teachable.
 */
function fitToCapacity(
  ordered: SchedTopic[],
  capacity: number,
  practiceRatio: number,
  unitCount: number,
  mockMinutes: number,
): { kept: SchedTopic[]; deferred: number[]; compression: number } {
  const demandOf = (topics: SchedTopic[]) =>
    topics.reduce((sum, t) => sum + t.estMinutes * (1 + practiceRatio) + REVIEW_OFFSETS.length * REVIEW_MINUTES, 0) +
    unitCount * ASSESS_MINUTES +
    mockMinutes;

  const kept = [...ordered];
  const deferred: number[] = [];
  const dependedOn = new Set(ordered.flatMap((t) => t.dependsOn));

  const MIN_COMPRESSION = 0.7;
  let compression = capacity / Math.max(1, demandOf(kept));

  while (compression < MIN_COMPRESSION && kept.length > 1) {
    // Drop the least valuable leaf topic: low weight, low difficulty, nothing depends on it.
    let victim = -1;
    let worst = Infinity;
    kept.forEach((t, i) => {
      if (dependedOn.has(t.idx)) return;
      const value = t.weight * 2 + t.difficulty * 0.5;
      if (value < worst) { worst = value; victim = i; }
    });
    if (victim === -1) break;   // everything is load-bearing; compress instead

    deferred.push(kept[victim].idx);
    kept.splice(victim, 1);
    compression = capacity / Math.max(1, demandOf(kept));
  }

  // Never inflate beyond 1.5× — extra room becomes practice depth, not padding.
  return { kept, deferred, compression: Math.min(1.5, Math.max(0.55, compression)) };
}

function mockCountFor(prepType: SchedInput['prepType'], studyDays: number): number {
  if (prepType === 'skill') return studyDays > 60 ? 2 : 1;
  if (studyDays > 120) return 5;
  if (studyDays > 60) return 4;
  return 2;
}

export function buildSchedule(input: SchedInput): SchedResult {
  const days = buildCalendar(input);

  if (!days.length || !input.topics.length) {
    return {
      sessions: [],
      deferredTopics: input.topics.map((t) => t.idx),
      mockDays: [],
      catchUpDays: [],
      stats: { studyDays: 0, totalMinutes: 0, capacityMinutes: 0, utilisation: 0, compression: 1, itemCount: 0 },
    };
  }

  const practiceRatio = PRACTICE_RATIO[input.prepType];
  const capacity = teachingCapacity(days);
  const unitTitle = new Map(input.units.map((u) => [u.idx, u.title]));

  // ---- Mocks -------------------------------------------------------------
  const mockDuration = input.prepType === 'exam' ? 120 : 75;
  const mockTotal = mockCountFor(input.prepType, days.length);
  const mockDayIndexes = new Set<number>();
  for (let i = 1; i <= mockTotal; i++) {
    // Spread across 45%→95% of the plan so each mock has new material to test.
    const position = 0.45 + (0.5 * i) / mockTotal;
    const day = days[Math.min(days.length - 1, Math.floor(days.length * position))];
    if (day) mockDayIndexes.add(day.dayIndex);
  }

  // ---- Fit ---------------------------------------------------------------
  const ordered = orderTopics(input.topics);
  const { kept, deferred, compression } = fitToCapacity(
    ordered,
    capacity,
    practiceRatio,
    input.units.length,
    mockDuration * mockTotal,
  );

  // ---- Layout ------------------------------------------------------------
  const sessions: SchedSession[] = days.map((d) => ({
    dayIndex: d.dayIndex,
    date: d.date,
    plannedMinutes: 0,
    headline: '',
    items: [],
  }));
  const remaining = new Map(days.map((d) => [d.dayIndex, d.capacity]));
  const byIndex = new Map(days.map((d) => [d.dayIndex, d]));
  const reviewQueue = new Map<number, SchedItem[]>();

  const place = (dayIndex: number, item: SchedItem): boolean => {
    const left = remaining.get(dayIndex);
    if (left === undefined || left < Math.min(item.estMinutes, MIN_CHUNK)) return false;
    const session = sessions[dayIndex - 1];
    item.estMinutes = Math.min(item.estMinutes, left);
    session.items.push(item);
    session.plannedMinutes += item.estMinutes;
    remaining.set(dayIndex, left - item.estMinutes);
    return true;
  };

  const queueReviews = (topic: SchedTopic, completedDay: number) => {
    REVIEW_OFFSETS.forEach((offset, tier) => {
      const target = completedDay + offset;
      if (!byIndex.has(target)) return;
      const item: SchedItem = {
        topicIdx: topic.idx,
        kind: 'review',
        title: `Recall: ${topic.title}`,
        detail:
          tier === 0
            ? 'Close your notes and reconstruct the core idea from memory, then check what you missed.'
            : tier === 1
              ? 'Re-derive the key result and redo one problem you found hard.'
              : 'Long-interval check: explain this topic out loud in under three minutes.',
        estMinutes: REVIEW_MINUTES,
        resourceRank: null,
      };
      reviewQueue.set(target, [...(reviewQueue.get(target) ?? []), item]);
    });
  };

  // ---- Day one -----------------------------------------------------------
  // A short, certain win before any new material.
  //
  // Day one is the highest-attrition point in any plan: it is the only day the
  // learner has no evidence they can do this. Opening with a 10-minute task
  // that is finishable by definition means the first thing they do is succeed,
  // and the first checkbox is ticked before the first hard idea arrives.
  const firstDay = days.find((d) => !d.isFinalStretch);
  if (firstDay) {
    place(firstDay.dayIndex, {
      topicIdx: null,
      kind: 'buffer',
      title: 'Set up and skim the map',
      detail:
        input.prepType === 'exam'
          ? 'Ten minutes, no studying. Open the Map tab and read the unit titles so you know the shape of what is coming. Decide where you will sit and at what time each day — deciding once beats deciding daily.'
          : 'Ten minutes, no studying. Open the Map tab and read the unit titles so you know the shape of what is coming. Set up whatever you will build in, so tomorrow starts with the work and not the tooling.',
      estMinutes: Math.min(10, firstDay.capacity),
      resourceRank: null,
    });
  }

  // Reserve mock slots up front so learn blocks flow around them.
  mockDayIndexes.forEach((dayIndex) => {
    place(dayIndex, {
      topicIdx: null,
      kind: 'mock',
      title: input.prepType === 'exam' ? 'Full-length mock test' : 'Timed skills assessment',
      detail:
        input.prepType === 'exam'
          ? 'Sit this uninterrupted under real exam conditions. Score it, then log every wrong answer by topic.'
          : 'Build or solve under time pressure without references, then review what you had to look up.',
      estMinutes: mockDuration,
      resourceRank: null,
    });
  });

  let cursor = 1;
  let lastUnit = -1;

  /** Distinct topics whose *first* block landed on a given day. */
  const newTopicsPerDay = new Map<number, Set<number>>();

  const advance = () => {
    while (cursor <= days.length) {
      const day = byIndex.get(cursor)!;
      const left = remaining.get(cursor) ?? 0;
      if (!day.isFinalStretch && !day.isCatchUp && left >= MIN_CHUNK) return true;
      cursor++;
    }
    return false;
  };

  /**
   * Move the cursor past days that have already met their new-concept quota.
   *
   * Only applied when opening a topic — continuing one already in progress is
   * not new load. Gives up rather than deferring the topic if every remaining
   * day is full: a slightly overloaded day beats material silently vanishing.
   */
  const advanceForNewTopic = (topicIdx: number): boolean => {
    if (!advance()) return false;

    const start = cursor;
    while (cursor <= days.length) {
      const opened = newTopicsPerDay.get(cursor);
      if (!opened || opened.has(topicIdx) || opened.size < MAX_NEW_TOPICS_PER_DAY) return true;
      cursor++;
      if (!advance()) {
        // Nothing left that satisfies the cap — fall back to the first usable
        // day rather than dropping the topic.
        cursor = start;
        return advance();
      }
    }
    cursor = start;
    return advance();
  };

  const markNewTopic = (dayIndex: number, topicIdx: number) => {
    const opened = newTopicsPerDay.get(dayIndex) ?? new Set<number>();
    opened.add(topicIdx);
    newTopicsPerDay.set(dayIndex, opened);
  };

  for (const topic of kept) {
    // Unit checkpoint before starting a new unit's material.
    if (lastUnit !== -1 && topic.unitIdx !== lastUnit && advance()) {
      place(cursor, {
        topicIdx: null,
        kind: 'assess',
        title: `Checkpoint: ${unitTitle.get(lastUnit) ?? 'previous unit'}`,
        detail: 'Self-test the whole unit without notes. Anything you cannot explain goes back into review.',
        estMinutes: ASSESS_MINUTES,
        resourceRank: null,
      });
    }
    lastUnit = topic.unitIdx;

    let learnLeft = Math.max(MIN_CHUNK, Math.round(topic.estMinutes * compression));
    let chunkNo = 0;
    let completedDay = cursor;
    const chunkCeiling = maxChunkFor(topic.difficulty);

    while (learnLeft > 0) {
      // Drain any reviews that came due before scheduling new material.
      // Retrieval first, then intake: recalling yesterday's topic is what makes
      // today's stick, and it is the thing a learner skips if it comes last.
      for (const review of reviewQueue.get(cursor) ?? []) place(cursor, review);
      reviewQueue.delete(cursor);

      // Only the first block of a topic counts as new cognitive load.
      const moved = chunkNo === 0 ? advanceForNewTopic(topic.idx) : advance();
      if (!moved) break;

      const left = remaining.get(cursor)!;
      const chunk = Math.max(MIN_CHUNK, Math.min(chunkCeiling, learnLeft, left));
      const multi = learnLeft > chunk || chunkNo > 0;

      place(cursor, {
        topicIdx: topic.idx,
        kind: 'learn',
        title: multi ? `${topic.title} — part ${chunkNo + 1}` : topic.title,
        detail:
          chunkNo === 0
            ? 'Work through the attached resource actively: pause it, write the idea in your own words, and note every question it raises. If you cannot explain it without looking, you have not finished.'
            : 'Pick up where you stopped — but first, from memory alone, say what the last block established. Check yourself, then continue.',
        estMinutes: chunk,
        resourceRank: chunkNo % 3,
      });

      if (chunkNo === 0) markNewTopic(cursor, topic.idx);

      learnLeft -= chunk;
      completedDay = cursor;
      chunkNo++;
      if ((remaining.get(cursor) ?? 0) < MIN_CHUNK) cursor++;
    }

    // Practice immediately after the material, same day if it fits.
    const practiceMinutes = Math.max(
      MIN_CHUNK,
      Math.round(topic.estMinutes * practiceRatio * compression),
    );
    let practiceLeft = practiceMinutes;
    let practiceChunk = 0;
    while (practiceLeft >= MIN_CHUNK && advance()) {
      const left = remaining.get(cursor)!;
      const chunk = Math.min(MAX_CHUNK, practiceLeft, left);
      if (chunk < MIN_CHUNK) { cursor++; continue; }

      place(cursor, {
        topicIdx: topic.idx,
        kind: input.prepType === 'skill' && topic.difficulty >= 4 && practiceChunk === 0 ? 'project' : 'practice',
        title:
          input.prepType === 'exam'
            ? `Problem set: ${topic.title}`
            : `Build/apply: ${topic.title}`,
        detail:
          input.prepType === 'exam'
            ? 'Solve without notes first. Mark every question you had to look up — those become drill cards.'
            : 'Apply it in code or on paper. Something small and complete beats something large and half-finished.',
        estMinutes: chunk,
        resourceRank: null,
      });

      practiceLeft -= chunk;
      completedDay = cursor;
      practiceChunk++;
      if ((remaining.get(cursor) ?? 0) < MIN_CHUNK) cursor++;
    }

    queueReviews(topic, completedDay);
  }

  // Any reviews still queued go onto their day (catch-up days included).
  reviewQueue.forEach((items, dayIndex) => {
    if (!byIndex.has(dayIndex)) return;
    items.forEach((item) => place(dayIndex, item));
  });

  // ---- Catch-up days -----------------------------------------------------
  days.filter((d) => d.isCatchUp).forEach((day) => {
    const session = sessions[day.dayIndex - 1];
    place(day.dayIndex, {
      topicIdx: null,
      kind: 'buffer',
      title: 'Catch-up & consolidation',
      detail:
        'No new material today. Clear anything you fell behind on, then re-read your own notes from the last two weeks.',
      estMinutes: Math.min(60, Math.max(30, Math.round(day.capacity * 0.5))),
      resourceRank: null,
    });
    if (!session.headline) session.headline = 'Catch-up & consolidation';
  });

  // ---- Final stretch -----------------------------------------------------
  // Revisit by weight × difficulty, so the highest-yield material is last-seen.
  const revisionOrder = [...kept].sort(
    (a, b) => b.weight * b.difficulty - a.weight * a.difficulty,
  );
  const finalDays = days.filter((d) => d.isFinalStretch);

  finalDays.forEach((day, i) => {
    const isLast = i === finalDays.length - 1;
    if (isLast) {
      place(day.dayIndex, {
        topicIdx: null,
        kind: 'assess',
        title: input.prepType === 'exam' ? 'Final readiness check' : 'Portfolio & narrative review',
        detail:
          input.prepType === 'exam'
            ? 'Light revision only. Re-read your error log and your one-page formula sheet. Rest early.'
            : 'Tidy your projects, write the README you would want a reviewer to read, and rehearse how you explain each one.',
        estMinutes: Math.min(90, day.capacity),
        resourceRank: null,
      });
      sessions[day.dayIndex - 1].headline = 'Final readiness';
      return;
    }

    let slot = 0;
    while ((remaining.get(day.dayIndex) ?? 0) >= MIN_CHUNK && revisionOrder.length) {
      const topic = revisionOrder[(i * 3 + slot) % revisionOrder.length];
      const ok = place(day.dayIndex, {
        topicIdx: topic.idx,
        kind: 'review',
        title: `Final revision: ${topic.title}`,
        detail: 'Highest-yield material. Recall first, verify second, and log anything still shaky.',
        estMinutes: Math.min(45, remaining.get(day.dayIndex) ?? 0),
        resourceRank: null,
      });
      if (!ok) break;
      slot++;
      if (slot > 6) break;
    }
    sessions[day.dayIndex - 1].headline = 'Final revision block';
  });

  // ---- Headlines ---------------------------------------------------------
  const topicTitle = new Map(input.topics.map((t) => [t.idx, t.title]));
  sessions.forEach((session) => {
    if (session.headline) return;
    if (session.items.some((i) => i.kind === 'mock')) { session.headline = 'Mock assessment'; return; }

    const primary = session.items.find((i) => i.kind === 'learn') ?? session.items[0];
    session.headline = primary
      ? (primary.topicIdx !== null ? topicTitle.get(primary.topicIdx) ?? primary.title : primary.title)
      : 'Rest & reset';
  });

  const nonEmpty = sessions.filter((s) => s.items.length > 0);
  const totalMinutes = nonEmpty.reduce((sum, s) => sum + s.plannedMinutes, 0);

  return {
    sessions: nonEmpty,
    deferredTopics: deferred,
    mockDays: [...mockDayIndexes].sort((a, b) => a - b),
    catchUpDays: days.filter((d) => d.isCatchUp).map((d) => d.dayIndex),
    stats: {
      studyDays: nonEmpty.length,
      totalMinutes,
      capacityMinutes: days.reduce((s, d) => s + d.capacity, 0),
      utilisation: Number((totalMinutes / Math.max(1, days.reduce((s, d) => s + d.capacity, 0))).toFixed(3)),
      compression: Number(compression.toFixed(3)),
      itemCount: nonEmpty.reduce((sum, s) => sum + s.items.length, 0),
    },
  };
}
