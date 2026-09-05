'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * The heading block every in-app screen starts with.
 *
 * Before this existed, the five workspace surfaces used four different heading
 * sizes and two different capitalisation styles, which is the sort of drift
 * nobody can name but everybody feels. One component, one scale, sentence case
 * everywhere.
 */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Right-aligned controls. Wraps beneath the title on a narrow screen. */
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 text-2xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        )}
        <h1 className="font-display text-fluid-h3 font-semibold tracking-tight text-ink">{title}</h1>
        {description && (
          // Capped at a reading measure: on an ultrawide monitor an uncapped
          // subtitle runs to 160 characters and stops being readable.
          <p className="mt-1.5 max-w-measure text-sm leading-relaxed text-ink-muted">{description}</p>
        )}
        {/*
          A short iridescent underline closing the heading block. It is the one
          piece of chrome shared by all six workspace surfaces, so it is what
          makes them read as one product rather than as six pages.

          Below the description rather than between it and the title: a rule in
          the middle reads as a divider and visually orphans the subtitle from
          the heading it belongs to.
        */}
        <div aria-hidden className="holo-rule mt-4 w-16" />
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** A heading for a section *within* a screen. One step down from PageHeader. */
export function SectionHeader({
  title,
  description,
  actions,
  icon,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-ink">
          {icon}
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-measure text-xs leading-relaxed text-ink-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
