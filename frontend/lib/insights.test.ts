import { describe, it, expect } from 'vitest';
import { INSIGHTS, CATEGORY_LABEL, insightOrder, insightOrderFor } from './insights';

describe('the insight pool', () => {
  it('has enough entries to cover a long build without repeating', () => {
    // A build can run past a minute; at ~7s an insight that is ~10 shown.
    expect(INSIGHTS.length).toBeGreaterThanOrEqual(30);
  });

  it('covers every declared category', () => {
    const present = new Set(INSIGHTS.map((i) => i.category));
    for (const category of Object.keys(CATEGORY_LABEL)) {
      expect(present.has(category as never)).toBe(true);
    }
  });

  it('keeps every entry short enough to read in one glance', () => {
    for (const insight of INSIGHTS) {
      expect(insight.text.length).toBeGreaterThan(20);
      expect(insight.text.length, insight.text).toBeLessThanOrEqual(215);
    }
  });

  it('quotes no invented statistics', () => {
    // The rule for this file: a claim is a well-replicated finding stated
    // qualitatively, a verifiable fact, or an attributed quote. A fabricated
    // "studies show 73%" is worse than no fact, because this is the first
    // thing the product says to a new learner.
    for (const insight of INSIGHTS) {
      expect(insight.text, insight.text).not.toMatch(/\d+\s?%/);
      expect(insight.text, insight.text).not.toMatch(/\b\d+(\.\d+)?\s?x\b/i);
      expect(insight.text, insight.text).not.toMatch(/studies show|research proves|scientists found/i);
    }
  });

  it('has no duplicate text', () => {
    const seen = new Set(INSIGHTS.map((i) => i.text.trim().toLowerCase()));
    expect(seen.size).toBe(INSIGHTS.length);
  });

  it('ends every entry as a complete sentence', () => {
    for (const insight of INSIGHTS) {
      expect(insight.text.trim(), insight.text).toMatch(/[.!?]$/);
    }
  });
});

describe('insightOrder', () => {
  it('shows every insight once before repeating any', () => {
    const order = insightOrder();
    expect(order).toHaveLength(INSIGHTS.length);
    expect(new Set(order.map((i) => i.text)).size).toBe(INSIGHTS.length);
  });

  it('actually shuffles', () => {
    // Independent random sampling would repeat within the first few draws,
    // which on a 40-second wait reads as a broken screen.
    const a = insightOrder().map((i) => i.text).join('|');
    const b = insightOrder().map((i) => i.text).join('|');
    const c = insightOrder().map((i) => i.text).join('|');
    expect(new Set([a, b, c]).size).toBeGreaterThan(1);
  });

  it('does not mutate the source pool', () => {
    const before = INSIGHTS.map((i) => i.text);
    insightOrder();
    expect(INSIGHTS.map((i) => i.text)).toEqual(before);
  });
});

describe('insightOrderFor', () => {
  it('restricts to the requested categories', () => {
    const order = insightOrderFor(['learning', 'focus']);
    expect(order.length).toBeGreaterThan(5);
    expect(order.every((i) => i.category === 'learning' || i.category === 'focus')).toBe(true);
  });

  it('returns an empty list rather than throwing on an empty selection', () => {
    expect(insightOrderFor([])).toEqual([]);
  });
});
