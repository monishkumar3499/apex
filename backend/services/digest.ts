/**
 * The plan digest: a compact, deterministic summary of a plan used as the
 * coach's standing context.
 *
 * Built in code, not by a model — it is exact, free, and regenerates instantly
 * when the plan changes. Budgeted to roughly 400 tokens.
 */

export interface DigestUnit {
  idx: number;
  title: string;
  weight: number;
  topics: Array<{ idx: number; title: string; mastery?: number }>;
}

export interface DigestInput {
  subject: string;
  prepType: string;
  level: string;
  startDate: string;
  targetDate: string;
  studyDays: number;
  weekdayMinutes: number;
  weekendMinutes: number;
  units: DigestUnit[];
  mockCount: number;
  deferredTopics: string[];
}

const CHAR_BUDGET = 1800; // ≈ 450 tokens

export function buildDigest(input: DigestInput): string {
  const hrs = (m: number) => (m % 60 === 0 ? `${m / 60}h` : `${(m / 60).toFixed(1)}h`);

  const lines: string[] = [
    `Subject: ${input.subject} (${input.prepType} prep, ${input.level})`,
    `Window: ${input.startDate} → ${input.targetDate} · ${input.studyDays} study days · ${hrs(input.weekdayMinutes)}/weekday, ${hrs(input.weekendMinutes)}/weekend`,
    `Assessments: ${input.mockCount} full mocks, ${input.units.length} unit checkpoints, spaced review at 2/7/21 days`,
    '',
    'Structure:',
  ];

  for (const unit of input.units) {
    const topics = unit.topics.map((t) => t.title).join('; ');
    lines.push(`${unit.idx + 1}. ${unit.title} [w${unit.weight}] — ${topics}`);
  }

  if (input.deferredTopics.length) {
    lines.push('', `Deferred as optional (did not fit the timeline): ${input.deferredTopics.join('; ')}`);
  }

  let digest = lines.join('\n');

  // Degrade gracefully on very large plans: keep units, trim topic lists.
  if (digest.length > CHAR_BUDGET) {
    const trimmed = [
      ...lines.slice(0, 5),
      ...input.units.map((u) => {
        const topics = u.topics.map((t) => t.title);
        const shown = topics.slice(0, 4).join('; ');
        const rest = topics.length - 4;
        return `${u.idx + 1}. ${u.title} [w${u.weight}] — ${shown}${rest > 0 ? ` (+${rest} more)` : ''}`;
      }),
    ];
    digest = trimmed.join('\n');
  }

  return digest.slice(0, CHAR_BUDGET);
}
