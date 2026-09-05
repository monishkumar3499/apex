'use client';

import * as React from 'react';
import * as SeparatorPrimitive from '@radix-ui/react-separator';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { OrbitRings } from './void';
import { cn } from '../../lib/utils';

/* --------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('shimmer rounded-lg', className)} />;
}

/**
 * A loading placeholder that mirrors the shape of what is coming.
 *
 * A spinner tells the learner to wait; a skeleton tells them what they are
 * waiting for, and stops the layout jumping when the content lands.
 */
export function SkeletonList({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="glass rounded-card p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-6 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full max-w-[18rem]" />
            </div>
          </div>
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/* ------------------------------------------------------------ Empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden rounded-panel',
        'border border-dashed border-line bg-glass/[0.03] px-6 py-14 text-center sm:py-20',
        className,
      )}
    >
      {/*
        An empty state is the one place with room for the orbit motif at full
        size, and the one place it does real work: it says "there is a system
        here, it just has nothing in it yet" rather than "this screen is
        broken".
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(420px,120%)] -translate-x-1/2 -translate-y-1/2 opacity-50"
      >
        <OrbitRings count={4} lit={1} />
      </div>

      {icon && (
        <div className="glass relative mb-5 grid h-12 w-12 place-items-center rounded-xl text-accent-vivid shadow-glow [&_svg]:size-5">
          {icon}
        </div>
      )}
      <h3 className="relative font-display text-base font-semibold tracking-tight">{title}</h3>
      {description && (
        <p className="relative mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>
      )}
      {action && <div className="relative mt-6">{action}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- Callout */

/**
 * An inline notice attached to the thing it is about.
 *
 * Distinct from a toast: a toast is for something that just happened and can
 * be dismissed, a callout is for a standing condition — overdue work, a tight
 * budget — that stays true until the learner acts on it.
 */
export function Callout({
  tone = 'info',
  icon,
  title,
  children,
  action,
  className,
}: {
  tone?: 'info' | 'warn' | 'danger' | 'success' | 'accent';
  icon?: React.ReactNode;
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-info/25 bg-info/[0.07] text-info',
    warn: 'border-warn/30 bg-warn/[0.07] text-warn',
    danger: 'border-danger/30 bg-danger/[0.07] text-danger',
    success: 'border-success/25 bg-success/[0.07] text-success',
    accent: 'border-accent/30 bg-accent/[0.06] text-accent',
  }[tone];

  return (
    <div
      // Warnings and errors are announced; informational notes are not, so a
      // screen reader is not interrupted by something merely descriptive.
      role={tone === 'danger' || tone === 'warn' ? 'alert' : undefined}
      className={cn('rounded-card border p-4 sm:p-5', tones, className)}
    >
      <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 gap-3">
          {icon && (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-current/15 [&_svg]:size-4.5">
              {icon}
            </span>
          )}
          <div className="min-w-0">
            {title && <p className="text-sm font-semibold text-ink">{title}</p>}
            {children && (
              <div className="mt-0.5 text-xs leading-relaxed text-ink-muted sm:text-sm">{children}</div>
            )}
          </div>
        </div>
        {action && <div className="shrink-0 self-start sm:self-auto">{action}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Separator */

export const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-line',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
      className,
    )}
    {...props}
  />
));
Separator.displayName = SeparatorPrimitive.Root.displayName;

/* ---------------------------------------------------------------- Avatar */

export function Avatar({
  src,
  name,
  email,
  className,
}: {
  src?: string | null;
  name?: string | null;
  email?: string | null;
  className?: string;
}) {
  const initials = (name ?? email ?? 'A')
    .split(/[\s@.]/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('');

  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative flex h-9 w-9 shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'bg-glass/[0.08] text-2xs font-semibold text-ink-muted ring-1 ring-inset ring-glass-edge/[0.1]',
        className,
      )}
    >
      {src && (
        <AvatarPrimitive.Image
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      )}
      {/*
        No delay: Radix defaults to showing nothing until the image errors,
        which leaves an empty grey disc in the header on a slow connection.
      */}
      <AvatarPrimitive.Fallback className="flex h-full w-full items-center justify-center">
        {initials || 'A'}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}
