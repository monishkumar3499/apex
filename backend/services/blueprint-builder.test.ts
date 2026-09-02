import { describe, it, expect } from 'vitest';
import { splitByWeight, mergeShards } from './blueprint-builder';
import type { BlueprintResult } from '../prompts/blueprint';

const unit = (t: string, w?: number) => ({ t, w });

const fulfilled = (value: BlueprintResult): PromiseSettledResult<BlueprintResult> => ({
  status: 'fulfilled',
  value,
});
const rejected = (reason: string): PromiseSettledResult<BlueprintResult> => ({
  status: 'rejected',
  reason: new Error(reason),
});

describe('splitByWeight', () => {
  it('keeps every unit, exactly once, in order', () => {
    const units = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((t) => unit(t, 3));
    const shards = splitByWeight(units, 3);

    const flat = shards.flat().map((u) => u.t);
    expect(flat).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  });

  it('produces contiguous slices, because units are in teaching order', () => {
    const units = ['A', 'B', 'C', 'D', 'E', 'F'].map((t) => unit(t, 3));
    const shards = splitByWeight(units, 3);

    for (const shard of shards) {
      const indices = shard.map((u) => units.findIndex((x) => x.t === u.t));
      for (let i = 1; i < indices.length; i++) {
        expect(indices[i]).toBe(indices[i - 1] + 1);
      }
    }
  });

  it('balances by weight, not by count', () => {
    // One very heavy unit should end up alone rather than dragging three
    // light ones into the same shard.
    const units = [unit('Heavy', 5), unit('a', 1), unit('b', 1), unit('c', 1), unit('d', 1), unit('e', 1)];
    const shards = splitByWeight(units, 2);

    const weights = shards.map((s) => s.reduce((sum, u) => sum + (u.w ?? 3), 0));
    const spread = Math.max(...weights) - Math.min(...weights);
    expect(spread).toBeLessThanOrEqual(2);
  });

  it('never emits an empty shard', () => {
    for (const parts of [2, 3, 4, 5]) {
      const units = ['A', 'B', 'C', 'D', 'E'].map((t) => unit(t, 3));
      const shards = splitByWeight(units, parts);
      expect(shards.every((s) => s.length > 0)).toBe(true);
      expect(shards.flat()).toHaveLength(5);
    }
  });

  it('does not ask for more shards than there are units', () => {
    const shards = splitByWeight([unit('A', 3), unit('B', 3)], 5);
    expect(shards.length).toBeLessThanOrEqual(2);
    expect(shards.flat()).toHaveLength(2);
  });

  it('treats a missing weight as the mid value rather than zero', () => {
    const shards = splitByWeight([{ t: 'A' }, { t: 'B' }, { t: 'C' }, { t: 'D' }], 2);
    expect(shards).toHaveLength(2);
    expect(shards.flat()).toHaveLength(4);
  });
});

describe('mergeShards', () => {
  it('takes the outline title, scope and query as authoritative', () => {
    const shards = [[{ t: 'Networks', s: 'Circuit fundamentals', w: 4, q: ['network theory lecture'] }]];
    const results = [
      fulfilled({
        u: [{ t: 'networks', s: 'model rewrote this', w: 1, q: ['model query'], tp: [{ t: 'Nodal analysis' }] }],
      }),
    ];

    const { units } = mergeShards(shards, results);
    expect(units[0].t).toBe('Networks');
    expect(units[0].s).toBe('Circuit fundamentals');
    expect(units[0].w).toBe(4);
    expect(units[0].q).toEqual(['network theory lecture']);
  });

  it('matches a unit whose title the model re-cased or re-punctuated', () => {
    const shards = [[{ t: 'Signals & Systems' }, { t: 'Digital Circuits' }]];
    const results = [
      fulfilled({
        u: [
          { t: 'signals and systems', tp: [{ t: 'Convolution' }] },
          { t: 'DIGITAL CIRCUITS', tp: [{ t: 'Karnaugh maps' }] },
        ],
      }),
    ];

    const { units, degradedUnits } = mergeShards(shards, results);
    expect(degradedUnits).toEqual([]);
    expect(units.map((u) => u.t)).toEqual(['Signals & Systems', 'Digital Circuits']);
  });

  it('never binds two outline units to the same produced unit', () => {
    // Containment matching would otherwise let "Analog" claim the same
    // "Analog Circuits" entry twice.
    const shards = [[{ t: 'Analog Circuits' }, { t: 'Analog Circuits II' }]];
    const results = [fulfilled({ u: [{ t: 'Analog Circuits', tp: [{ t: 'Op-amps' }] }] })];

    const { units, degradedUnits } = mergeShards(shards, results);
    expect(units).toHaveLength(1);
    expect(degradedUnits).toEqual(['Analog Circuits II']);
  });

  it('rebases shard-local dependency ordinals into global ones', () => {
    // Shard 1 emits two topics; shard 2's "dep: [1]" means its own first
    // topic, which is globally topic 3.
    const shards = [[{ t: 'U1' }], [{ t: 'U2' }]];
    const results = [
      fulfilled({ u: [{ t: 'U1', tp: [{ t: 'a' }, { t: 'b', dep: [1] }] }] }),
      fulfilled({ u: [{ t: 'U2', tp: [{ t: 'c' }, { t: 'd', dep: [1] }] }] }),
    ];

    const { units } = mergeShards(shards, results);

    // Shard 1: local 1 → global 1.
    expect(units[0].tp[1].dep).toEqual([1]);
    // Shard 2: local 1 → global 3, not 1.
    expect(units[1].tp[1].dep).toEqual([3]);
  });

  it('drops forward references, which would reorder the syllabus', () => {
    const shards = [[{ t: 'U1' }]];
    const results = [
      fulfilled({ u: [{ t: 'U1', tp: [{ t: 'a', dep: [2] }, { t: 'b' }] }] }),
    ];

    const { units } = mergeShards(shards, results);
    // Topic "a" is global 1 and cannot depend on global 2.
    expect(units[0].tp[0].dep).toEqual([]);
  });

  it('de-duplicates rebased dependencies', () => {
    const shards = [[{ t: 'U1' }]];
    const results = [fulfilled({ u: [{ t: 'U1', tp: [{ t: 'a' }, { t: 'b', dep: [1, 1] }] }] })];

    const { units } = mergeShards(shards, results);
    expect(units[0].tp[1].dep).toEqual([1]);
  });

  it('loses one shard without losing the others', () => {
    const shards = [[{ t: 'U1' }, { t: 'U2' }], [{ t: 'U3' }]];
    const results = [
      rejected('rate limited on every fallback'),
      fulfilled({ u: [{ t: 'U3', tp: [{ t: 'c' }] }] }),
    ];

    const { units, degradedUnits } = mergeShards(shards, results);
    expect(units.map((u) => u.t)).toEqual(['U3']);
    expect(degradedUnits).toEqual(['U1', 'U2']);
  });

  it('counts a unit the shard returned empty as degraded', () => {
    const shards = [[{ t: 'U1' }, { t: 'U2' }]];
    const results = [
      fulfilled({ u: [{ t: 'U1', tp: [] }, { t: 'U2', tp: [{ t: 'x' }] }] }),
    ];

    const { units, degradedUnits } = mergeShards(shards, results);
    expect(units.map((u) => u.t)).toEqual(['U2']);
    expect(degradedUnits).toEqual(['U1']);
  });

  it('keeps global ordinals correct when an earlier shard is missing', () => {
    // A dropped shard must not leave a gap that shifts later dep numbers.
    const shards = [[{ t: 'U1' }], [{ t: 'U2' }]];
    const results = [rejected('gone'), fulfilled({ u: [{ t: 'U2', tp: [{ t: 'a' }, { t: 'b', dep: [1] }] }] })];

    const { units } = mergeShards(shards, results);
    // U2's topics are now global 1 and 2, so dep local-1 rebases to 1.
    expect(units[0].tp[1].dep).toEqual([1]);
  });

  it('handles a shard result that is missing entirely', () => {
    const shards = [[{ t: 'U1' }], [{ t: 'U2' }]];
    const { units, degradedUnits } = mergeShards(shards, [
      fulfilled({ u: [{ t: 'U1', tp: [{ t: 'a' }] }] }),
    ]);

    expect(units.map((u) => u.t)).toEqual(['U1']);
    expect(degradedUnits).toEqual(['U2']);
  });
});
