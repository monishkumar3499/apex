'use client';

import * as React from 'react';
import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

/**
 * The one chip control.
 *
 * Five screens had each grown their own version of "a row of selectable
 * pills": the library filters, the intake date presets, the capacity presets,
 * the day-off picker and the heatmap view switch. They differed in height,
 * radius, selected treatment and — the part that actually mattered — three of
 * the five were plain `<button>`s with no `aria-pressed` and no arrow-key
 * navigation, so a keyboard user had to tab through every option.
 *
 * Radix ToggleGroup gives the roving tabindex and the pressed state; the
 * styling below is the single visual answer for all five.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
  /** Small trailing figure, e.g. a result count. */
  count?: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

const ITEM = cn(
  'relative inline-flex min-h-touch items-center justify-center gap-1.5 whitespace-nowrap',
  'rounded-field border px-3 py-2 text-xs font-medium',
  'outline-none transition-colors duration-150',
  'focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-1 focus-visible:ring-offset-bg',
  'disabled:pointer-events-none disabled:opacity-45',
  'data-[state=off]:border-glass-edge/[0.09] data-[state=off]:bg-glass/[0.05] data-[state=off]:text-ink-muted',
  'data-[state=off]:hover:border-accent/25 data-[state=off]:hover:text-ink',
  'data-[state=on]:border-accent/50 data-[state=on]:bg-accent/12 data-[state=on]:text-accent data-[state=on]:shadow-glow',
  '[&_svg]:size-3.5 [&_svg]:shrink-0',
);

/** Single-select row of chips. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  scroll,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<SegmentedOption<T>>;
  className?: string;
  ariaLabel: string;
  /** Scroll horizontally instead of wrapping — for long filter rows on a phone. */
  scroll?: boolean;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="single"
      value={value}
      // Radix emits '' when the active item is re-pressed. A single-select
      // filter has no meaningful empty state, so that is ignored.
      onValueChange={(next) => next && onChange(next as T)}
      aria-label={ariaLabel}
      className={cn(
        scroll ? 'scroll-x -mx-1 flex gap-1.5 px-1 pb-1 sm:flex-wrap sm:overflow-visible' : 'flex flex-wrap gap-1.5',
        className,
      )}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(ITEM, scroll && 'shrink-0')}
        >
          {option.icon}
          {option.label}
          {option.count !== undefined && (
            <span className="tabular text-ink-faint">{option.count}</span>
          )}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

/** Multi-select row of chips — the rest-days picker. */
export function SegmentedMulti<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  equal,
}: {
  value: T[];
  onChange: (value: T[]) => void;
  options: Array<SegmentedOption<T>>;
  className?: string;
  ariaLabel: string;
  /** Split the row into equal columns — for the seven weekday buttons. */
  equal?: boolean;
}) {
  return (
    <ToggleGroupPrimitive.Root
      type="multiple"
      value={value}
      onValueChange={(next) => onChange(next as T[])}
      aria-label={ariaLabel}
      className={cn(equal ? 'flex gap-1 xs:gap-1.5' : 'flex flex-wrap gap-1.5', className)}
    >
      {options.map((option) => (
        <ToggleGroupPrimitive.Item
          key={option.value}
          value={option.value}
          disabled={option.disabled}
          className={cn(ITEM, equal && 'min-w-0 flex-1 px-1 text-sm')}
        >
          {option.icon}
          {option.label}
        </ToggleGroupPrimitive.Item>
      ))}
    </ToggleGroupPrimitive.Root>
  );
}

/**
 * A true segmented control: options inside one track, with the selection
 * indicator sliding between them. For 2–3 mutually exclusive *views* of the
 * same data, where the chip row above would read as a filter instead.
 */
export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode }>;
  className?: string;
  ariaLabel: string;
}) {
  const id = React.useId();
  const reduced = useReducedMotion();

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn('well inline-flex rounded-field p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex min-h-[2.25rem] items-center justify-center gap-1.5 rounded-[7px] px-3',
              'text-2xs font-medium outline-none transition-colors duration-150',
              'focus-visible:ring-2 focus-visible:ring-accent/60',
              active ? 'text-ink' : 'text-ink-muted hover:text-ink',
              '[&_svg]:size-3.5 [&_svg]:shrink-0',
            )}
          >
            {active && (
              // layoutId is what makes the pill travel between options rather
              // than cross-fade. Motion measures both positions and animates
              // the delta on the compositor.
              <motion.span
                layoutId={`segmented-${id}`}
                className="absolute inset-0 rounded-[7px] bg-glass/[0.1] shadow-glow ring-1 ring-glass-edge/[0.12] backdrop-blur-sm"
                transition={
                  reduced ? { duration: 0 } : { type: 'spring', stiffness: 420, damping: 34 }
                }
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              {option.icon}
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
