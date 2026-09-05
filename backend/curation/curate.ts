import { searchVideos, searchPlaylists } from '../tools/youtube';
import { searchWeb } from '../tools/tavily';
import { scoreYouTube, scoreWeb, dedupe, type Curated } from './score';

import { similarity, keywordCoverage } from './text';
import { logger } from '../logger/pino';

/**
 * Deterministic resource curation.
 *
 * The model contributes only short natural-language *search intents*. Every
 * URL, title, duration and thumbnail comes from a real API response, and the
 * topic↔resource binding is computed here with text similarity. That means:
 *   • zero hallucinated links,
 *   • zero tokens spent restating URLs the model already saw,
 *   • a resource can be re-ranked or refreshed without another model call.
 *
 * Curation runs in two passes. The first searches once per unit, which covers
 * most topics cheaply (YouTube `search.list` costs 100 quota units a call). The
 * second pass targets only the topics the first left uncovered, so quota is
 * spent where coverage is actually missing.
 */

export interface CurationTopic {
  idx: number;
  title: string;
  summary?: string;
  keywords: string[];
  unitIdx: number;
}

export interface CurationUnit {
  idx: number;
  title: string;
  /** 1–2 short queries supplied by the blueprint model. */
  queries: string[];
}

export interface CurationInput {
  subject: string;
  prepType: 'exam' | 'skill' | 'hybrid';
  units: CurationUnit[];
  topics: CurationTopic[];
  /** Ceiling on first-pass YouTube searches (one per unit). */
  videoSearchBudget?: number;
  webSearchBudget?: number;
  /** Ceiling on second-pass searches for topics left uncovered. */
  gapSearchBudget?: number;
  /** In-flight subject-level searches started before the blueprint returned. */
  discovery?: SubjectDiscovery;
}

/**
 * Subject-level searches that do not depend on the blueprint.
 *
 * A "complete course" playlist query and "<subject> official syllabus" need
 * only the subject and the prep type — both of which are known the moment the
 * plan row is created, several seconds before the structure model returns.
 * Running them concurrently with that call removes their latency from the
 * build entirely rather than making them faster.
 */
export interface SubjectDiscovery {
  playlists: Promise<Awaited<ReturnType<typeof searchPlaylists>>>;
  web: Promise<Awaited<ReturnType<typeof searchWeb>>[]>;
  queries: string[];
}

export function startSubjectDiscovery(params: {
  subject: string;
  prepType: 'exam' | 'skill' | 'hybrid';
}): SubjectDiscovery {
  const playlistQuery =
    params.prepType === 'exam'
      ? `${params.subject} full syllabus lecture series`
      : `${params.subject} complete course`;

  const queries = [
    params.prepType === 'exam'
      ? `${params.subject} official syllabus exam pattern`
      : `${params.subject} roadmap skills required`,
    `${params.subject} best resources books documentation`,
  ];

  return {
    // Both tools already swallow their own failures and return [], so an
    // unawaited rejection here is not possible.
    playlists: searchPlaylists(playlistQuery, 4),
    web: Promise.all(queries.map((q) => searchWeb(q, { maxResults: 6 }))),
    queries,
  };
}

/** A curated resource plus the unit whose search surfaced it. */
type Sourced = Curated & { unitIdx: number | null };

export interface CurationResult {
  resources: Curated[];
  /** topic idx → resource urls, best first */
  assignments: Map<number, string[]>;
  stats: {
    videoSearches: number;
    webSearches: number;
    gapSearches: number;
    found: number;
    assigned: number;
    /** Topics that ended up with a genuinely on-topic resource. */
    covered: number;
    /** Topics carrying at least one video or playlist. */
    withVideo: number;
    /**
     * Topics whose video is unit- or subject-level rather than topic-specific.
     *
     * Reported rather than hidden: it is the honest measure of how much of the
     * "every topic has something to watch" guarantee was met by adjacency.
     */
    fallbackVideo: number;
  };
}

const RESOURCES_PER_TOPIC = 3;

/**
 * Minimum similarity for a resource to be called "about this topic".
 *
 * Below this it is unit-adjacent material at best. Attaching a sequential-logic
 * video to an RC-transients topic is worse than attaching nothing: it teaches
 * the wrong thing and quietly destroys trust in every other recommendation.
 */
const RELEVANCE_FLOOR = 0.14;

/** How well a resource matches a topic, on 0..1. */
function relevanceTo(topic: CurationTopic, text: string): number {
  const titleSim = similarity(topic.title, text);
  const coverage = keywordCoverage(topic.keywords, text);
  const summarySim = topic.summary ? similarity(topic.summary, text) * 0.5 : 0;
  return Math.min(1, titleSim * 0.5 + coverage * 0.35 + summarySim * 0.15);
}

export async function curateResources(input: CurationInput): Promise<CurationResult> {
  const videoBudget = input.videoSearchBudget ?? 8;
  const webBudget = input.webSearchBudget ?? 6;
  const gapBudget = input.gapSearchBudget ?? 8;

  const pool: Sourced[] = [];
  let videoSearches = 0;
  let gapSearches = 0;

  const bestRelevance = (text: string) =>
    input.topics.reduce((max, t) => Math.max(max, relevanceTo(t, text)), 0);

  // ---- Pass 1 · one search per unit --------------------------------------
  const unitPlan = input.units
    .slice(0, Math.max(1, videoBudget - 1))
    .map((u) => ({ unitIdx: u.idx, query: u.queries[0] || `${input.subject} ${u.title}` }));

  // Subject-level searches may already be in flight, started before the
  // blueprint call. When they are, awaiting them here costs nothing: they have
  // been running for as long as the structure model took.
  const discovery = input.discovery ?? startSubjectDiscovery(input);

  // Unit-specific web queries still need the blueprint, so they start now.
  const unitWebQueries = input.units
    .slice(0, Math.max(0, webBudget - discovery.queries.length))
    .map((u) => `${u.title} ${input.subject} tutorial`);

  const [unitBatches, playlists, subjectWeb, unitWeb] = await Promise.all([
    Promise.all(unitPlan.map((u) => searchVideos(u.query, 12))),
    discovery.playlists,
    discovery.web,
    Promise.all(unitWebQueries.map((q) => searchWeb(q, { maxResults: 6 }))),
  ]);

  const webBatches = [...subjectWeb, ...unitWeb];
  const webQueries = [...discovery.queries, ...unitWebQueries];

  videoSearches = unitPlan.length + 1;

  unitBatches.forEach((batch, i) => {
    const unitIdx = unitPlan[i].unitIdx;
    batch.forEach((v) =>
      pool.push({ ...scoreYouTube(v, bestRelevance(`${v.title} ${v.description}`)), unitIdx }),
    );
  });
  playlists.forEach((p) =>
    pool.push({ ...scoreYouTube(p, bestRelevance(`${p.title} ${p.description}`)), unitIdx: null }),
  );
  webBatches.flat().forEach((w) =>
    pool.push({ ...scoreWeb(w, bestRelevance(`${w.title} ${w.content}`)), unitIdx: null }),
  );

  // ---- Assignment --------------------------------------------------------
  // A small reuse penalty spreads material across the plan instead of pinning
  // one popular video to every topic — the exact failure mode of asking a model
  // to "distribute the links".
  const useCount = new Map<string, number>();

  /**
   * How many topics a resource clears the floor for.
   *
   * A syllabus PDF or "complete course" page matches every topic's keywords
   * because it literally contains the syllabus. That makes it a plan-level
   * document, not a lesson on any one topic — so breadth is a penalty here,
   * and a resource matching almost everything is treated as not covering
   * anything specifically.
   */
  const breadth = new Map<string, number>();
  const specificityLimit = Math.max(2, Math.ceil(input.topics.length * 0.4));

  const measureBreadth = (candidates: Sourced[]) => {
    breadth.clear();
    for (const resource of candidates) {
      const text = `${resource.title} ${resource.description}`;
      const hits = input.topics.filter((t) => relevanceTo(t, text) >= RELEVANCE_FLOOR).length;
      breadth.set(resource.url, hits);
    }
  };
  measureBreadth(pool);

  const isSpecific = (url: string) => (breadth.get(url) ?? 1) <= specificityLimit;

  const rankFor = (topic: CurationTopic, candidates: Sourced[]) =>
    candidates
      .map((r) => {
        const relevance = relevanceTo(topic, `${r.title} ${r.description}`);
        const reuse = useCount.get(r.url) ?? 0;
        const breadthPenalty = Math.min(0.3, 0.05 * Math.max(0, (breadth.get(r.url) ?? 1) - 1));
        return {
          resource: r,
          relevance,
          value: relevance * 0.68 + r.score * 0.32 - reuse * 0.14 - breadthPenalty,
        };
      })
      .filter((c) => c.relevance >= RELEVANCE_FLOOR)
      .sort((a, b) => b.value - a.value)
      .slice(0, RESOURCES_PER_TOPIC);

  const assignments = new Map<number, string[]>();
  const commit = (topic: CurationTopic, picks: string[]) => {
    picks.forEach((url) => useCount.set(url, (useCount.get(url) ?? 0) + 1));
    assignments.set(topic.idx, picks);
  };

  // A topic counts as covered only if something *specific* to it was found;
  // a generic match is provisional and still earns a targeted search.
  const uncovered: CurationTopic[] = [];
  for (const topic of input.topics) {
    const ranked = rankFor(topic, pool);
    if (ranked.length) commit(topic, ranked.map((r) => r.resource.url));
    if (!ranked.some((r) => isSpecific(r.resource.url))) uncovered.push(topic);
  }

  // ---- Pass 2 · targeted searches for the gaps ---------------------------
  // Only the topics the unit-level sweep missed. Highest-weight gaps first, so
  // a quota ceiling costs the least important topics rather than a random tail.
  if (uncovered.length) {
    const targets = uncovered.slice(0, gapBudget);
    logger.info({ gaps: uncovered.length, searching: targets.length }, 'curation.gap-pass');

    const batches = await Promise.all(
      targets.map((t) => searchVideos(`${t.title} ${input.subject}`, 8)),
    );
    gapSearches = targets.length;

    batches.forEach((batch, i) => {
      const unitIdx = targets[i].unitIdx;
      batch.forEach((v) =>
        pool.push({ ...scoreYouTube(v, relevanceTo(targets[i], `${v.title} ${v.description}`)), unitIdx }),
      );
    });

    measureBreadth(pool);
  }

  // ---- Resolve whatever is still uncovered -------------------------------
  let covered = input.topics.length - uncovered.length;
  for (const topic of uncovered) {
    // The provisional generic pick doesn't hold a reservation against the retry.
    (assignments.get(topic.idx) ?? []).forEach((url) =>
      useCount.set(url, Math.max(0, (useCount.get(url) ?? 1) - 1)),
    );

    const ranked = rankFor(topic, pool);
    if (ranked.length) {
      commit(topic, ranked.map((r) => r.resource.url));
      if (ranked.some((r) => isSpecific(r.resource.url))) covered++;
      continue;
    }

    // Still nothing on-topic. Fall back only to material from the SAME unit —
    // adjacent context is defensible, a resource from another unit is not.
    const sameUnit = pool
      .filter((r) => r.unitIdx === topic.unitIdx)
      .sort(
        (a, b) =>
          (useCount.get(a.url) ?? 0) - (useCount.get(b.url) ?? 0) || b.score - a.score,
      )
      .slice(0, 1);

    commit(topic, sameUnit.map((r) => r.url));
  }

  // ---- Dedupe, then repair anything the dedupe orphaned -------------------
  const deduped = dedupe(pool);
  const byUrl = new Map(deduped.map((r) => [r.url, r]));
  // `dedupe` returns `Curated`, dropping the `unitIdx` the pool carried, so the
  // unit each URL came from is kept alongside rather than read off the result.
  const unitOf = new Map(pool.map((r) => [r.url, r.unitIdx]));

  assignments.forEach((urls, topicIdx) => {
    const surviving = urls.filter((u) => byUrl.has(u));
    if (surviving.length !== urls.length) assignments.set(topicIdx, surviving);
  });

  /*
    ---- Video guarantee ---------------------------------------------------

    Every topic gets something watchable, because a topic whose only resource
    is a PDF is a topic most learners will skip. This costs no extra searches:
    it re-ranks the pool that pass one and pass two already fetched.

    It is also where this file's stated principle — "attaching the wrong
    resource is worse than attaching nothing" — has to be honoured rather than
    waived. So the fallback ladder never reaches for an unrelated topic's
    video. It descends through material that is defensibly *about the same
    thing*, in order:

      1. a video that clears the relevance floor for this topic
      2. a video from the same unit — adjacent context, already the fallback
         this file used for non-video material
      3. the subject-level "complete course" playlist, which is legitimately
         about every topic in the subject (see `startSubjectDiscovery`)

    If none of those exist the topic keeps whatever it had. Nothing is invented.
  */
  const watchable = (url: string) => {
    const kind = byUrl.get(url)?.kind;
    return kind === 'video' || kind === 'playlist';
  };

  const videoPool = deduped.filter((r) => r.kind === 'video' || r.kind === 'playlist');

  let withVideo = 0;
  let fallbackVideo = 0;

  for (const topic of input.topics) {
    const urls = assignments.get(topic.idx) ?? [];
    if (urls.some(watchable)) {
      withVideo++;
      continue;
    }

    const ranked = videoPool
      .map((r) => {
        const relevance = relevanceTo(topic, `${r.title} ${r.description}`);
        const unitIdx = unitOf.get(r.url) ?? null;
        const onTopic = relevance >= RELEVANCE_FLOOR;
        const sameUnit = unitIdx === topic.unitIdx;
        // Subject-level playlists have no unit; they are the last defensible
        // rung, not a random pick, so they score above nothing and below both
        // topic-specific and same-unit material.
        const subjectWide = unitIdx === null && r.kind === 'playlist';
        if (!onTopic && !sameUnit && !subjectWide) return null;

        const tier = onTopic ? 2 : sameUnit ? 1 : 0;
        const reuse = useCount.get(r.url) ?? 0;
        return { resource: r, tier, value: relevance * 0.5 + r.score * 0.5 - reuse * 0.1 };
      })
      .filter((c): c is { resource: Curated; tier: number; value: number } => c !== null)
      .sort((a, b) => b.tier - a.tier || b.value - a.value);

    const pick = ranked[0];
    if (!pick) continue;

    // At the cap, the weakest existing pick makes room. Appending past the cap
    // would quietly widen every topic's shelf and change what the scheduler
    // hands to a `learn` item.
    const room = urls.length >= RESOURCES_PER_TOPIC ? urls.slice(0, RESOURCES_PER_TOPIC - 1) : urls;
    assignments.set(topic.idx, [...room, pick.resource.url]);
    useCount.set(pick.resource.url, (useCount.get(pick.resource.url) ?? 0) + 1);

    withVideo++;
    if (pick.tier < 2) fallbackVideo++;
  }

  /*
    ---- The shelf ---------------------------------------------------------

    A resource is kept if it is good enough to browse (score gate) OR if some
    topic points at it. The second half is the bug fix: the gate used to run
    first and could delete a topic's only resource, leaving the topic with an
    empty list and the library missing something the map linked to.
  */
  const referenced = new Set([...assignments.values()].flat());
  const resources = deduped.filter((r) => r.score > 0.18 || referenced.has(r.url));

  const assigned = [...assignments.values()].reduce((s, a) => s + a.length, 0);
  const empty = input.topics.filter((t) => !(assignments.get(t.idx) ?? []).length).length;

  logger.info(
    {
      found: resources.length,
      assigned,
      covered,
      withVideo,
      fallbackVideo,
      empty,
      total: input.topics.length,
    },
    'curation.complete',
  );

  return {
    resources,
    assignments,
    stats: {
      videoSearches,
      webSearches: webQueries.length,
      gapSearches,
      found: resources.length,
      assigned,
      covered,
      withVideo,
      fallbackVideo,
    },
  };
}
