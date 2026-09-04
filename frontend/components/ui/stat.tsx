'use client';

import * as React from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

/**
 * The one stat tile.
 *
 * Three screens were each rendering their own version of "big number, small
 * caption" at three different sizes. The value is the loudest thing in the
 * tile because the value is the point; the label is set small and quiet
 * because a caption competing with its own number helps nobody.
 */
export function Stat({
  value,
  label,
  hint,
  icon,
  tone = 'default',
  className,
}: {
  value: React.ReactNode;
  label: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: 'default' | 'accent' | 'warn' | 'success' | 'danger';
  className?: string;
}) {
  return (
    <div className={cn('surface flex min-w-0 flex-col rounded-card p-3.5 sm:p-4', className)}>
      {icon && (
        <span
          className={cn(
            'mb-3 flex h-7 w-7 items-center justify-center rounded-lg [&_svg]:size-4',
            tone === 'accent' && 'bg-accent/12 text-accent',
            tone === 'warn' && 'bg-warn/12 text-warn',
            tone === 'success' && 'bg-success/12 text-success',
            tone === 'danger' && 'bg-danger/12 text-danger',
            tone === 'default' && 'bg-surface-3 text-ink-faint',
          )}
        >
          {icon}
        </span>
      )}

      {/*
        Proportional figures, not tabular: at display sizes tabular-nums opens
        up the spacing enough that the number looks loosely set. Tabular is for
        figures that tick, which these do not.
      */}
      <p className="truncate font-display text-xl font-semibold leading-none tracking-tight text-ink sm:text-2xl">
        {value}
      </p>
      <p className="mt-1.5 truncate text-2xs font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      {hint && <p className="mt-1 truncate text-2xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/**
 * A number that counts up when it first scrolls into view.
 *
 * Used only where the figure is a headline claim — a total, a streak. Applied
 * to every number on a screen it becomes noise, and it is skipped entirely
 * under `prefers-reduced-motion`, where a value that animates is the exact
 * thing being opted out of.
 */
export function CountUp({
  value,
  duration = 0.9,
  format = (n: number) => String(Math.round(n)),
  className,
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const reduced = useReducedMotion();
  const started = React.useRef(false);

  /*
    Seeded with the real value, not with zero.

    `useReducedMotion` is `false` on the server and `true` on a client that has
    the setting on, so seeding from it made the server render "0" where the
    client rendered "38" — a hydration mismatch that React reports and cannot
    patch. Rendering the true figure up front is also the better no-JS and
    pre-hydration state: the number is correct before anything animates, rather
    than being a zero that only becomes true once JavaScript runs.

    The ramp then starts from zero inside the effect, after hydration.
  */
  const [display, setDisplay] = React.useState(value);

  React.useEffect(() => {
    // Not yet on screen, or the learner has asked for no motion: show the
    // figure as it is.
    if (reduced || !inView) {
      setDisplay(value);
      return;
    }

    // The ramp is a one-time entrance. If it has already played, a later value
    // change should land on the new figure rather than counting up again.
    if (started.current) {
      setDisplay(value);
      return;
    }
    started.current = true;

    let raf = 0;
    const start = performance.now();
    setDisplay(0);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / (duration * 1000));
      // Same easing as the rest of the system, so it settles the way the
      // panels around it do.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(value * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value, duration, reduced]);

  return (
    <motion.span ref={ref} className={className}>
      {format(display)}
    </motion.span>
  );
}
