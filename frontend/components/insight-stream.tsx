'use client';

import * as React from 'react';
import { Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import {
  insightOrder,
  insightOrderFor,
  CATEGORY_LABEL,
  type Insight,
  type InsightCategory,
} from '../lib/insights';

/**
 * The reading surface for a long wait.
 *
 * One insight at a time, faded in, held, faded out. Deliberately *not* a
 * carousel with dots and arrows: this is something to glance at while waiting,
 * and any control implies the learner is supposed to be operating it.
 *
 * Three details that decide whether it feels calm or cheap:
 *
 *   • The container is reserved at a fixed minimum height. Sizing to the
 *     current text makes the whole panel jump on every change, which pulls the
 *     eye away from the build progress underneath.
 *   • It pauses while the tab is hidden. Otherwise a learner who switches away
 *     for a minute comes back to the middle of a sentence, having missed six.
 *   • Under `prefers-reduced-motion` the text swaps without a transition and
 *     dwells longer, rather than being animated more gently. Cross-fading text
 *     is the specific thing that setting is asking you not to do.
 */
export function InsightStream({
  className,
  categories,
  /** Total ms per insight, fade included. */
  intervalMs = 7_000,
  compact = false,
}: {
  className?: string;
  categories?: InsightCategory[];
  intervalMs?: number;
  compact?: boolean;
}) {
  // Built once per mount: a reshuffle on re-render would jump mid-sentence.
  const queue = React.useMemo<Insight[]>(
    () => (categories?.length ? insightOrderFor(categories) : insightOrder()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [index, setIndex] = React.useState(0);
  const [visible, setVisible] = React.useState(true);
  const reducedMotion = useReducedMotion();

  React.useEffect(() => {
    if (queue.length < 2) return;

    let fadeOut: ReturnType<typeof setTimeout>;
    let paused = document.visibilityState === 'hidden';

    const onVisibility = () => {
      paused = document.visibilityState === 'hidden';
    };
    document.addEventListener('visibilitychange', onVisibility);

    const FADE_MS = 420;
    const advance = setInterval(() => {
      if (paused) return;

      if (reducedMotion) {
        setIndex((i) => (i + 1) % queue.length);
        return;
      }

      setVisible(false);
      fadeOut = setTimeout(() => {
        setIndex((i) => (i + 1) % queue.length);
        setVisible(true);
      }, FADE_MS);
    }, Math.max(reducedMotion ? 9_000 : 3_000, intervalMs));

    return () => {
      clearInterval(advance);
      clearTimeout(fadeOut);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [queue.length, intervalMs, reducedMotion]);

  const insight = queue[index];
  if (!insight) return null;

  return (
    <div
      className={cn(
        'glass flex gap-3 rounded-2xl px-4 py-4',
        // Reserved height, so the panel never resizes as the text changes.
        compact ? 'min-h-[5.5rem]' : 'min-h-[7rem] sm:min-h-[6.5rem]',
        className,
      )}
      // The wait content is decorative relative to the build progress. A
      // screen reader announcing a new fact every seven seconds would talk
      // over the stage updates that actually matter.
      aria-hidden
    >
      <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-accent" />

      <div
        className={cn(
          'min-w-0 flex-1',
          !reducedMotion && 'transition-[opacity,transform] duration-[420ms] ease-out',
          !reducedMotion && (visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'),
        )}
      >
        <p className={cn('leading-relaxed text-ink-muted', compact ? 'text-xs' : 'text-[0.8125rem] sm:text-sm')}>
          {insight.text}
        </p>
        <p className="mt-1.5 text-2xs uppercase tracking-wider text-ink-faint">
          {insight.source ?? CATEGORY_LABEL[insight.category]}
        </p>
      </div>
    </div>
  );
}

/** Live `prefers-reduced-motion`, so a mid-session change is respected. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
