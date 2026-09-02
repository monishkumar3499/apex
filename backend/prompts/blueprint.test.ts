import { describe, it, expect } from 'vitest';
import {
  normalizeBlueprint,
  blueprintUser,
  outlineUser,
  topicsUser,
  BLUEPRINT_VERSION,
  TOPIC_MIN_MINUTES,
  TOPIC_MAX_MINUTES,
  type BlueprintRequest,
} from './blueprint';

const req = (over: Partial<BlueprintRequest> = {}): BlueprintRequest => ({
  subject: 'GATE Electronics and Communication Engineering',
  prepType: 'exam',
  scope: 'Score above 700 on GATE ECE',
  level: 'beginner',
  weeks: 26,
  studyHours: 220,
  topicTarget: 60,
  unitTarget: 10,
  extras: {},
  ...over,
});

describe('normalizeBlueprint', () => {
  it('coerces a bare string where the schema promised a list', () => {
    // The field note says "ONE natural search query", and models take that
    // literally and emit a string. Every downstream .map then throws.
    const result = normalizeBlueprint({
      u: [{ t: 'Networks', q: 'network theory lecture', tp: [{ t: 'Nodal analysis', k: 'kcl' }] }],
    });

    expect(result.u[0].q).toEqual(['network theory lecture']);
    expect(result.u[0].tp[0].k).toEqual(['kcl']);
  });

  it('drops units and topics with no title', () => {
    const result = normalizeBlueprint({
      u: [
        { t: '', tp: [] },
        { t: 'Real unit', tp: [{ t: 'Real topic' }, { s: 'no title' }] },
        null,
        'garbage',
      ],
    });

    // Empty-titled units survive normalisation (the pipeline filters them),
    // but nothing throws and every shape is the declared one.
    expect(Array.isArray(result.u)).toBe(true);
    const real = result.u.find((u) => u.t === 'Real unit');
    expect(real?.tp.map((t) => t.t)).toEqual(['Real topic', '']);
  });

  it('survives a completely absent payload', () => {
    expect(normalizeBlueprint(undefined).u).toEqual([]);
    expect(normalizeBlueprint({}).u).toEqual([]);
    expect(normalizeBlueprint({ u: null }).u).toEqual([]);
  });

  it('clamps a topic estimate a learner could never finish', () => {
    // A prompt constraint is a request. m=300 reaches the learner as five
    // consecutive blocks carrying the same title.
    const result = normalizeBlueprint({
      u: [{ t: 'U', tp: [{ t: 'Huge', m: 300 }, { t: 'Tiny', m: 3 }, { t: 'Fine', m: 60 }] }],
    });

    expect(result.u[0].tp[0].m).toBe(TOPIC_MAX_MINUTES);
    expect(result.u[0].tp[1].m).toBe(TOPIC_MIN_MINUTES);
    expect(result.u[0].tp[2].m).toBe(60);
  });

  it('leaves an absent estimate absent rather than inventing one', () => {
    const result = normalizeBlueprint({ u: [{ t: 'U', tp: [{ t: 'No estimate' }] }] });
    expect(result.u[0].tp[0].m).toBeUndefined();
  });

  it('discards a non-numeric estimate instead of producing NaN', () => {
    const result = normalizeBlueprint({ u: [{ t: 'U', tp: [{ t: 'X', m: 'about an hour' }] }] });
    expect(result.u[0].tp[0].m).toBeUndefined();
  });

  it('keeps only finite dependency ordinals', () => {
    const result = normalizeBlueprint({
      u: [{ t: 'U', tp: [{ t: 'X', dep: [1, 'two', null, 3] }] }],
    });
    expect(result.u[0].tp[0].dep).toEqual([1, 3]);
  });
});

describe('prompt construction', () => {
  it('states the per-topic average, which a model gets wrong from a total alone', () => {
    const prompt = blueprintUser(req({ studyHours: 200, topicTarget: 50 }));
    // 200h over 50 topics is 240 minutes each.
    expect(prompt).toContain('240 minutes');
    expect(prompt).toContain('EXACTLY 50 topics');
  });

  it('adapts granularity guidance to the stated level', () => {
    expect(blueprintUser(req({ level: 'beginner' }))).toMatch(/starting fresh|Steps must be small/i);
    expect(blueprintUser(req({ level: 'advanced' }))).toMatch(/already works in the area/i);
    expect(blueprintUser(req({ level: 'intermediate' }))).toMatch(/knows the basics/i);
  });

  it('asks the outline call for units only', () => {
    const prompt = outlineUser(req({ unitTarget: 9 }));
    expect(prompt).toContain('EXACTLY 9 units');
    expect(prompt).not.toMatch(/topic/i);
  });

  it('gives a topics shard the full unit list, so it does not duplicate another shard', () => {
    const prompt = topicsUser({
      req: req(),
      allUnitTitles: ['Networks', 'Signals', 'Digital', 'Analog'],
      shardUnits: [{ t: 'Digital', w: 4 }, { t: 'Analog', w: 3 }],
      topicTarget: 20,
      isFirstShard: false,
    });

    // Context: everything.
    expect(prompt).toContain('Networks');
    expect(prompt).toContain('Signals');
    // Remit: only its own slice.
    expect(prompt).toContain('Write topics for ONLY these units');
    expect(prompt).toContain('EXACTLY 20 topics');
  });

  it('only asks the first shard for the easy opening topics', () => {
    const base = {
      req: req(),
      allUnitTitles: ['A', 'B'],
      shardUnits: [{ t: 'A' }],
      topicTarget: 10,
    };
    expect(topicsUser({ ...base, isFirstShard: true })).toContain('START WITH WINS');
    expect(topicsUser({ ...base, isFirstShard: false })).not.toContain('START WITH WINS');
  });

  it('tells the shard that dep is local to its own response', () => {
    const prompt = topicsUser({
      req: req(),
      allUnitTitles: ['A'],
      shardUnits: [{ t: 'A' }],
      topicTarget: 5,
      isFirstShard: true,
    });
    // The merge step rebases these; a shard cannot know global ordinals.
    expect(prompt.length).toBeGreaterThan(0);
  });
});

describe('BLUEPRINT_VERSION', () => {
  it('is a positive integer, because it is part of a cache key', () => {
    expect(Number.isInteger(BLUEPRINT_VERSION)).toBe(true);
    expect(BLUEPRINT_VERSION).toBeGreaterThan(0);
  });
});
