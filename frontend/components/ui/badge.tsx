'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

/**
 * Tone is a claim about meaning, not decoration: `success` says the thing is
 * finished, `danger` says something is wrong. The tones map 1:1 onto the
 * semantic colour tokens so a badge can never invent a colour of its own.
 */
const badgeVariants = cva(
  cn(
    'inline-flex items-center gap-1 whitespace-nowrap rounded-md border',
    'px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide',
    '[&_svg]:size-2.5 [&_svg]:shrink-0',
  ),
  {
    variants: {
      tone: {
        accent: 'border-accent/25 bg-accent/12 text-accent',
        info: 'border-info/25 bg-info/12 text-info',
        success: 'border-success/25 bg-success/12 text-success',
        warn: 'border-warn/25 bg-warn/12 text-warn',
        danger: 'border-danger/25 bg-danger/12 text-danger',
        muted: 'border-line bg-surface-2 text-ink-muted',
        /** Filled. For the single most important status on a screen. */
        solid: 'border-transparent bg-accent text-accent-fg',
      },
    },
    defaultVariants: { tone: 'muted' },
  },
);

type Tone = NonNullable<NonNullable<VariantProps<typeof badgeVariants>>['tone']>;

const TONES = new Set<string>(['accent', 'info', 'success', 'warn', 'danger', 'muted', 'solid']);

export interface BadgeProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> {
  /**
   * Widened to `string` on purpose: several call sites read the tone out of a
   * status map keyed by data from the database, so the value is not known to
   * be one of the variants at compile time. Anything unrecognised renders as
   * `muted` rather than as an unstyled badge.
   */
  tone?: string | null;
}

export function Badge({ className, tone, ...props }: BadgeProps) {
  const safe = (tone && TONES.has(tone) ? tone : 'muted') as Tone;
  return <span className={cn(badgeVariants({ tone: safe }), className)} {...props} />;
}

export { badgeVariants };
