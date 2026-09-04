'use client';

import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

type Tone = 'accent' | 'success' | 'info' | 'warn' | 'danger';

const BAR: Record<Tone, string> = {
  accent: 'bg-accent',
  success: 'bg-success',
  info: 'bg-info',
  warn: 'bg-warn',
  danger: 'bg-danger',
};

const STROKE: Record<Tone, string> = {
  accent: 'stroke-accent',
  success: 'stroke-success',
  info: 'stroke-info',
  warn: 'stroke-warn',
  danger: 'stroke-danger',
};

/**
 * Linear progress, on Radix so the ARIA contract is not hand-maintained.
 *
 * The fill is translated rather than width-animated: transform is composited,
 * so a dozen of these on the map screen do not each trigger layout.
 */
export function Progress({
  value,
  className,
  tone = 'accent',
  showTrack = true,
  label,
}: {
  value: number;
  className?: string;
  tone?: Tone;
  showTrack?: boolean;
  /** Give the bar an accessible name when its meaning is not in nearby text. */
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));

  return (
    <ProgressPrimitive.Root
      value={clamped}
      aria-label={label}
      className={cn(
        'relative h-1.5 w-full overflow-hidden rounded-full',
        showTrack && 'bg-surface-sunken',
        className,
      )}
    >
      <ProgressPrimitive.Indicator
        className={cn('h-full w-full rounded-full transition-transform duration-700 ease-out', BAR[tone])}
        style={{ transform: `translateX(-${100 - clamped}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

/**
 * Circular progress for the day/plan completion dials.
 *
 * Motion drives the dash offset so the ring eases into place on mount, which
 * is the moment the number actually means something — a static ring reads as
 * a decoration rather than as a reading of the learner's day.
 */
export function Dial({
  value,
  size = 44,
  stroke = 4,
  children,
  tone = 'accent',
  className,
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  /*
    `useReducedMotion` resolves to `false` during SSR and flips to `true` on the
    client for anyone with the OS setting on. It must therefore never decide
    what the *first* render emits — driving `initial` from it made the server
    and client disagree about the rendered `stroke-dashoffset`, which React
    reports as a hydration mismatch and does not repair.

    So `initial` is unconditional, and the preference is applied where it is
    invisible to hydration: the transition duration.
  */
  const reduced = useReducedMotion();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${clamped}% complete`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-surface-sunken"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: reduced ? 0 : 0.9, ease: [0.16, 1, 0.3, 1] }}
          className={STROKE[tone]}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-2xs font-semibold tabular"
        aria-hidden
      >
        {children ?? `${clamped}%`}
      </span>
    </div>
  );
}
