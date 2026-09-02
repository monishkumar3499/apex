import { runJson, TokenLedger } from '../ai/model-router';
import {
  OUTLINE_SYSTEM,
  OUTLINE_SCHEMA_HINT,
  outlineUser,
  TOPICS_SYSTEM,
  TOPICS_SCHEMA_HINT,
  topicsUser,
  BLUEPRINT_SYSTEM,
  BLUEPRINT_SCHEMA_HINT,
  blueprintUser,
  normalizeBlueprint,
  type BlueprintRequest,
  type BlueprintResult,
  type BlueprintUnit,
} from '../prompts/blueprint';
import { logger } from '../logger/pino';

/**
 * Blueprint generation, in two parallel stages.
 *
 * The single-call version asked one model for the entire structure. Measured
 * against the live API on a 65-topic plan that is ~6,000 output tokens and
 * **33 seconds** — the largest single component of a build, and output tokens
 * cannot be parallelised within one response.
 *
 * So the work is split:
 *
 *   outline   one small call for the unit list       (~300 tok,  ~4s)
 *   topics    2-3 concurrent calls, one per slice    (~2,500 tok each, ~14s)
 *
 * Wall-clock becomes `outline + slowest shard` instead of the sum. It also
 * makes the stage partially recoverable: a shard that fails costs its units'
 * topics, not the whole build.
 *
 * `generateBlueprint` falls back to the original single call when sharding
 * cannot work (too few units, or the outline itself failed), so there is always
 * a path to a plan.
 */

/** Outline shape — units only, no topics. */
interface Outline {
  u: Array<{ t: string; s?: string; w?: number; q?: string[] }>;
}

/**
 * Topics per shard.
 *
 * Three shards is the ceiling on purpose. The free Gemini tier allows roughly
 * ten requests per minute and a build already spends one on classification, so
 * one call per unit would rate-limit reliably on a ten-unit plan. Three
 * captures most of the latency win with quota to spare for the retry.
 */
const MAX_SHARDS = 3;
const MIN_UNITS_PER_SHARD = 3;

export interface BlueprintProgress {
  (message: string, meta?: Record<string, unknown>): void | Promise<void>;
}

export async function generateBlueprint(params: {
  req: BlueprintRequest;
  ledger?: TokenLedger;
  onProgress?: BlueprintProgress;
}): Promise<{ blueprint: BlueprintResult; sharded: boolean; degradedUnits: string[] }> {
  const { req, ledger, onProgress } = params;

  // A small plan is one fast call already; sharding it would add a round trip
  // to save nothing.
  if (req.unitTarget < MIN_UNITS_PER_SHARD * 2) {
    return { blueprint: await singleCall(req, ledger), sharded: false, degradedUnits: [] };
  }

  let outline: Outline;
  try {
    outline = await runJson<Outline>({
      tier: 'structured',
      label: 'blueprint:outline',
      temperature: 0.25,
      // The unit list is a few hundred tokens; the headroom is for a fallback
      // model that bills its reasoning against the same budget.
      maxTokens: 4_000,
      reasoning: { effort: 'low' },
      schemaHint: OUTLINE_SCHEMA_HINT,
      ledger,
      messages: [
        { role: 'system', content: OUTLINE_SYSTEM },
        { role: 'user', content: outlineUser(req) },
      ],
    });
  } catch (error) {
    logger.warn({ error }, 'blueprint.outline.failed, falling back to a single call');
    return { blueprint: await singleCall(req, ledger), sharded: false, degradedUnits: [] };
  }

  const units = (outline.u ?? [])
    .filter((u) => u && typeof u.t === 'string' && u.t.trim())
    .map((u) => ({
      t: String(u.t).trim(),
      s: u.s === undefined || u.s === null ? undefined : String(u.s),
      w: Number.isFinite(Number(u.w)) ? Number(u.w) : undefined,
      q: (Array.isArray(u.q) ? u.q : u.q ? [u.q] : []).map(String),
    }));

  if (units.length < MIN_UNITS_PER_SHARD * 2) {
    logger.warn({ units: units.length }, 'blueprint.outline.too-small, falling back to a single call');
    return { blueprint: await singleCall(req, ledger), sharded: false, degradedUnits: [] };
  }

  await onProgress?.(`Mapped ${units.length} units — writing topics in parallel`, {
    units: units.length,
  });

  // ---- Shard -------------------------------------------------------------
  const shardCount = Math.max(2, Math.min(MAX_SHARDS, Math.floor(units.length / MIN_UNITS_PER_SHARD)));
  const shards = splitByWeight(units, shardCount);
  const allTitles = units.map((u) => u.t);

  // Topic budget follows summed unit *weight*, not unit count.
  //
  // Splitting by count looked balanced and was not: the prompt tells each shard
  // to distribute topics by weight, so a shard holding four high-weight units
  // produced far more than its share. Measured across three shards that came
  // out as 5,945 / 4,813 / 3,397 output tokens — and since the shards run
  // concurrently, the largest one alone sets the wall-clock. Weighting the
  // split flattens that.
  const totalWeight = units.reduce((sum, u) => sum + weightOf(u), 0);
  const perShardTargets = shards.map((shard) => {
    const shardWeight = shard.reduce((sum, u) => sum + weightOf(u), 0);
    return Math.max(3, Math.round((req.topicTarget * shardWeight) / Math.max(1, totalWeight)));
  });

  const results = await Promise.allSettled(
    shards.map((shard, i) =>
      runJson<BlueprintResult>({
        tier: 'structured',
        label: `blueprint:topics${i + 1}`,
        temperature: 0.25,
        maxTokens: 12_000,
        reasoning: { effort: 'low' },
        schemaHint: TOPICS_SCHEMA_HINT,
        ledger,
        messages: [
          { role: 'system', content: TOPICS_SYSTEM },
          {
            role: 'user',
            content: topicsUser({
              req,
              allUnitTitles: allTitles,
              shardUnits: shard,
              topicTarget: perShardTargets[i],
              isFirstShard: i === 0,
            }),
          },
        ],
      }),
    ),
  );

  // ---- Merge -------------------------------------------------------------
  const { units: merged, degradedUnits } = mergeShards(shards, results);

  const topicCount = merged.reduce((sum, u) => sum + u.tp.length, 0);

  // Nothing usable came back at all — one full call is better than a failure.
  if (!merged.length || topicCount < Math.max(6, req.topicTarget * 0.25)) {
    logger.warn(
      { units: merged.length, topicCount, target: req.topicTarget },
      'blueprint.shards.insufficient, falling back to a single call',
    );
    return { blueprint: await singleCall(req, ledger), sharded: false, degradedUnits: [] };
  }

  if (degradedUnits.length) {
    logger.warn({ degradedUnits }, 'blueprint.shards.partial');
  }

  logger.info(
    { units: merged.length, topics: topicCount, shards: shardCount, degraded: degradedUnits.length },
    'blueprint.sharded.complete',
  );

  return { blueprint: { u: merged }, sharded: true, degradedUnits };
}

/** The original single-response path, kept as the fallback. */
async function singleCall(req: BlueprintRequest, ledger?: TokenLedger): Promise<BlueprintResult> {
  const generated = await runJson<BlueprintResult>({
    tier: 'structured',
    label: 'blueprint',
    temperature: 0.25,
    // A 65-topic blueprint is ~6k tokens of JSON. The headroom above that is
    // for reasoning models, which bill their thinking against the same budget —
    // at 6000 they spent it all thinking and returned nothing.
    maxTokens: 16_000,
    reasoning: { effort: 'low' },
    schemaHint: BLUEPRINT_SCHEMA_HINT,
    ledger,
    messages: [
      { role: 'system', content: BLUEPRINT_SYSTEM },
      { role: 'user', content: blueprintUser(req) },
    ],
  });

  return normalizeBlueprint(generated);
}

type OutlineUnit = { t: string; s?: string; w?: number; q?: string[] };

/**
 * Stitch the shard responses back into one blueprint.
 *
 * Two things here are easy to get wrong and are therefore tested directly
 * (`blueprint-builder.test.ts`):
 *
 *   Title matching. Shards are told to echo the unit title exactly and do not:
 *   they re-case it, drop an ampersand, or expand an abbreviation. An exact
 *   match alone silently dropped whole units.
 *
 *   Dependency rebasing. A shard numbers `dep` against its *own* output,
 *   because it cannot know the global ordinal of a topic another shard has not
 *   written yet. Merging without rebasing points every dependency at the wrong
 *   topic — and since the scheduler orders topologically, that quietly
 *   reorders the syllabus rather than failing.
 */
export function mergeShards(
  shards: OutlineUnit[][],
  results: Array<PromiseSettledResult<BlueprintResult>>,
): { units: BlueprintUnit[]; degradedUnits: string[] } {
  const merged: BlueprintUnit[] = [];
  const degradedUnits: string[] = [];
  // Running count of topics already merged, used to rebase local ordinals.
  let globalTopicOffset = 0;

  shards.forEach((shard, shardIndex) => {
    const result = results[shardIndex];

    if (!result || result.status === 'rejected') {
      logger.error(
        { shardIndex, units: shard.map((u) => u.t), error: (result as PromiseRejectedResult)?.reason },
        'blueprint.shard.failed',
      );
      degradedUnits.push(...shard.map((u) => u.t));
      return;
    }

    const produced = normalizeBlueprint(result.value).u;
    // Ordinals within this shard's own output, in emission order.
    let localOrdinal = 0;
    const claimed = new Set<BlueprintUnit>();

    for (const outlineUnit of shard) {
      const match = matchUnit(produced, outlineUnit, claimed);

      if (!match?.tp?.length) {
        degradedUnits.push(outlineUnit.t);
        continue;
      }
      claimed.add(match);

      merged.push({
        // The outline's title, scope and search query are authoritative — the
        // topics call was never asked to improve on them.
        t: outlineUnit.t,
        s: outlineUnit.s ?? match.s,
        w: outlineUnit.w ?? match.w,
        q: outlineUnit.q?.length ? outlineUnit.q : match.q,
        tp: match.tp.map((topic) => {
          const rebased = (topic.dep ?? [])
            // Shard-local 1-based → global 1-based.
            .map((d) => Number(d) + globalTopicOffset)
            // Drop forward references, including any this shard emitted.
            .filter((d) => Number.isFinite(d) && d >= 1 && d <= globalTopicOffset + localOrdinal);
          localOrdinal++;
          return { ...topic, dep: [...new Set(rebased)] };
        }),
      });
    }

    globalTopicOffset += localOrdinal;
  });

  return { units: merged, degradedUnits };
}

/** Exact title, then normalised, then containment. Never reuses a unit. */
function matchUnit(
  produced: BlueprintUnit[],
  outlineUnit: OutlineUnit,
  claimed: Set<BlueprintUnit>,
): BlueprintUnit | undefined {
  const free = produced.filter((u) => !claimed.has(u));
  const wanted = loose(outlineUnit.t);

  return (
    free.find((u) => u.t === outlineUnit.t) ??
    free.find((u) => loose(u.t) === wanted) ??
    free.find((u) => {
      const candidate = loose(u.t);
      // Guard against a one-word title matching everything by containment.
      if (candidate.length < 4 || wanted.length < 4) return false;
      return candidate.includes(wanted) || wanted.includes(candidate);
    })
  );
}

const weightOf = (unit: OutlineUnit) => Math.max(1, Math.min(5, Number(unit.w) || 3));

/**
 * Contiguous slices of near-equal total weight.
 *
 * Contiguous is a hard requirement: units are in teaching order and a shard
 * spanning units 1, 5 and 9 would be asked to write topics for material whose
 * prerequisites live in another shard.
 *
 * Weight rather than count, because weight is what drives how many topics — and
 * therefore how many output tokens — a shard produces. Since shards run
 * concurrently, the build waits on the heaviest one, so balancing weight is
 * what actually shortens the stage. Every shard is guaranteed at least one unit.
 */
export function splitByWeight(units: OutlineUnit[], parts: number): OutlineUnit[][] {
  const count = Math.max(1, Math.min(parts, units.length));
  const total = units.reduce((sum, u) => sum + weightOf(u), 0);
  const targetPerShard = total / count;

  const out: OutlineUnit[][] = [];
  let current: OutlineUnit[] = [];
  let currentWeight = 0;

  units.forEach((unit, index) => {
    current.push(unit);
    currentWeight += weightOf(unit);

    const shardsRemaining = count - out.length - 1;
    const unitsRemaining = units.length - index - 1;

    // Close the shard once it has met its share — but never so eagerly that a
    // later shard would be left with no units at all.
    const metShare = currentWeight >= targetPerShard && shardsRemaining > 0;
    const mustClose = unitsRemaining === shardsRemaining && shardsRemaining > 0;

    if (metShare || mustClose) {
      out.push(current);
      current = [];
      currentWeight = 0;
    }
  });

  if (current.length) out.push(current);
  return out;
}

/**
 * A title reduced to its identifying words.
 *
 * Punctuation goes, and so do the joining words models freely swap: asked to
 * echo "Signals & Systems" a model returns "Signals and Systems", which
 * survives punctuation-stripping as "signals and systems" and no longer
 * matches "signals systems". Dropping the joiners makes the two identical.
 */
const JOINERS = new Set(['and', 'or', 'the', 'of', 'for', 'to', 'in', 'a', 'an', 'amp']);

const loose = (value: string) =>
  value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !JOINERS.has(word))
    .join(' ');
