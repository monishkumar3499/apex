/**
 * Things worth reading while a plan builds.
 *
 * A build takes tens of seconds. A spinner over that span reads as a hang, and
 * a progress bar alone gives the learner nothing to do with the wait. So the
 * wait carries content — and since the audience is someone who has just
 * committed to studying, the content is about how learning and attention
 * actually work. Half of what is here is directly actionable on the plan they
 * are about to open.
 *
 * Two rules for anything added to this file:
 *
 *   1. No invented numbers. Every claim is either a well-replicated finding
 *      stated qualitatively, a verifiable fact, or an attributed quote. A
 *      fabricated "studies show 73%" is worse than no fact at all, because
 *      this screen is the first thing the product says to a new learner.
 *   2. Short enough to finish in one glance — roughly under 200 characters.
 */

export type InsightCategory = 'learning' | 'focus' | 'mind' | 'world';

export interface Insight {
  text: string;
  /** Set only where a specific person or effect is genuinely the source. */
  source?: string;
  category: InsightCategory;
}

export const CATEGORY_LABEL: Record<InsightCategory, string> = {
  learning: 'How learning works',
  focus: 'Focus & follow-through',
  mind: 'The mind',
  world: 'Worth knowing',
};

export const INSIGHTS: Insight[] = [
  // ---- How learning works -------------------------------------------------
  {
    text: 'Trying to recall something strengthens the memory more than reading it again does. Re-reading feels like progress; retrieval is the progress.',
    source: 'the testing effect',
    category: 'learning',
  },
  {
    text: 'The same total study time, spread across several days, produces markedly better retention than the same hours in one sitting.',
    source: 'the spacing effect',
    category: 'learning',
  },
  {
    text: 'Forgetting is steepest in the first day. A short review tomorrow is worth more than a long one next week.',
    source: 'Ebbinghaus',
    category: 'learning',
  },
  {
    text: 'Mixing problem types feels harder and scores worse in practice — then transfers far better to the real test.',
    source: 'interleaving',
    category: 'learning',
  },
  {
    text: 'Some conditions make learning feel slower while making it last longer. Fluency during study is a poor guide to what you will remember.',
    source: 'Robert Bjork, desirable difficulty',
    category: 'learning',
  },
  {
    text: 'Guessing an answer before you are taught it improves later recall — even when the guess turns out to be wrong.',
    source: 'the pretesting effect',
    category: 'learning',
  },
  {
    text: 'Producing an answer yourself is remembered better than reading the same answer. Close the page and write it out first.',
    source: 'the generation effect',
    category: 'learning',
  },
  {
    text: 'Explaining a concept out loud, to nobody, exposes the gaps that silent re-reading hides.',
    source: 'self-explanation',
    category: 'learning',
  },
  {
    text: 'Sleep is part of studying. Memories are consolidated overnight, so a night between two sessions does work no third session can.',
    category: 'learning',
  },
  {
    text: 'Words plus a diagram beat words alone. The two are stored through different channels and reinforce each other.',
    source: 'dual coding',
    category: 'learning',
  },
  {
    text: 'Working memory, not willpower, is the bottleneck. A topic split into two sittings is not half-studied — it is correctly sized.',
    source: 'cognitive load theory',
    category: 'learning',
  },
  {
    text: 'Highlighting and re-reading are the two most popular study techniques, and among the least effective ones measured.',
    category: 'learning',
  },
  {
    text: 'The unusual item in a list is the one you will remember. Give the thing you keep forgetting a strange, specific hook.',
    source: 'the von Restorff effect',
    category: 'learning',
  },
  {
    text: 'A task you stopped halfway stays active in your mind. Ending a session mid-thought makes it easier to restart tomorrow.',
    source: 'the Zeigarnik effect',
    category: 'learning',
  },
  {
    text: 'Practice is only deliberate when it targets what you cannot yet do and tells you quickly whether you got it right.',
    source: 'Anders Ericsson',
    category: 'learning',
  },

  // ---- Focus & follow-through ---------------------------------------------
  {
    text: 'Work expands to fill the time available for its completion.',
    source: "Parkinson's law",
    category: 'focus',
  },
  {
    text: 'Deciding in advance exactly when and where you will study raises follow-through far more than deciding to try harder.',
    source: 'implementation intentions',
    category: 'focus',
  },
  {
    text: 'Switching tasks leaves part of your attention on the previous one. The cost is not the switch; it is the residue.',
    source: 'attention residue',
    category: 'focus',
  },
  {
    text: 'It always takes longer than you expect, even when you take into account this law.',
    source: "Hofstadter's law",
    category: 'focus',
  },
  {
    text: 'People underestimate how long their own tasks will take even after repeatedly experiencing the same overrun.',
    source: 'the planning fallacy',
    category: 'focus',
  },
  {
    text: 'When a measure becomes a target, it stops being a good measure. Hours logged is not hours learned.',
    source: "Goodhart's law",
    category: 'focus',
  },
  {
    text: 'Attention runs in cycles of roughly an hour and a half. Working with the trough instead of through it costs less than it looks like it saves.',
    category: 'focus',
  },
  {
    text: 'A streak is easier to keep than to restart. On a bad day, the smallest possible session beats a skipped one.',
    category: 'focus',
  },
  {
    text: 'Starting is the expensive part. Committing to five minutes routinely produces forty.',
    category: 'focus',
  },
  {
    text: 'A plan you can follow on your worst week is worth more than a plan that only works on your best one.',
    category: 'focus',
  },

  // ---- The mind -----------------------------------------------------------
  {
    text: 'The first principle is that you must not fool yourself — and you are the easiest person to fool.',
    source: 'Richard Feynman',
    category: 'mind',
  },
  {
    text: 'Chess masters recall real board positions almost perfectly, and random ones no better than beginners. Expertise is stored patterns, not raw memory.',
    source: 'Chase & Simon',
    category: 'mind',
  },
  {
    text: 'Knowing one workable method makes a better one harder to see. The fix is to solve it a second way on purpose.',
    source: 'the Einstellung effect',
    category: 'mind',
  },
  {
    text: 'Once you understand something, you can no longer imagine not understanding it — which is why experts write confusing explanations.',
    source: 'the curse of knowledge',
    category: 'mind',
  },
  {
    text: 'The least skilled are the least able to judge their own skill, because the knowledge needed to do the task is the knowledge needed to assess it.',
    source: 'Dunning & Kruger',
    category: 'mind',
  },
  {
    text: 'Measured IQ scores rose substantially across the twentieth century in every country with long-running data.',
    source: 'the Flynn effect',
    category: 'mind',
  },
  {
    text: 'How much you can hold in mind at once predicts performance on reasoning tests better than almost any other single measure.',
    category: 'mind',
  },
  {
    text: 'Stepping away from a stuck problem lets it keep being worked on. Incubation is not procrastination if you have loaded the problem first.',
    category: 'mind',
  },
  {
    text: 'Your brain is about two percent of your body weight and uses about a fifth of its energy. Thinking is metabolically expensive.',
    category: 'mind',
  },
  {
    text: 'Confidence and accuracy are only loosely related. The feeling of knowing is generated separately from the knowing.',
    category: 'mind',
  },

  // ---- Worth knowing ------------------------------------------------------
  {
    text: 'There are more possible games of chess than there are atoms in the observable universe.',
    category: 'world',
  },
  {
    text: 'A day on Venus is longer than a year on Venus. It orbits the Sun faster than it turns.',
    category: 'world',
  },
  {
    text: 'Honey does not spoil. Sealed pots of it, thousands of years old, have been found still edible.',
    category: 'world',
  },
  {
    text: 'Sharks are older than trees. They were swimming for something like a hundred million years before the first forests.',
    category: 'world',
  },
  {
    text: 'Octopuses have three hearts and blue blood, and two of the hearts stop when they swim.',
    category: 'world',
  },
  {
    text: 'Sunlight takes about eight minutes to reach Earth — so you always see the Sun where it was, never where it is.',
    category: 'world',
  },
  {
    text: 'A teaspoon of neutron star material would weigh about as much as a mountain range.',
    category: 'world',
  },
  {
    text: 'Bananas are berries. Strawberries are not.',
    category: 'world',
  },
  {
    text: 'Tardigrades have survived direct exposure to the vacuum of space.',
    category: 'world',
  },
  {
    text: 'The Great Pyramid was already more than two thousand years old when Cleopatra was born.',
    category: 'world',
  },
];

/**
 * A shuffled reading order.
 *
 * Sampling at random independently each time repeats items within the first
 * few draws, which on a 40-second wait is obvious and makes the screen look
 * broken. A shuffled walk shows every insight once before any repeats.
 *
 * The bias in `Math.random()`-keyed sorting does not matter here, but a
 * Fisher-Yates shuffle is the same amount of code and is actually uniform.
 */
export function insightOrder(pool: Insight[] = INSIGHTS): Insight[] {
  const items = [...pool];
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Restrict the pool to particular categories, keeping the shuffle. */
export function insightOrderFor(categories: InsightCategory[]): Insight[] {
  const allowed = new Set(categories);
  return insightOrder(INSIGHTS.filter((i) => allowed.has(i.category)));
}
