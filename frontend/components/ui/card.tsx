'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * The surface every panel in the app sits on.
 *
 * `interactive` is a separate flag from `raised` on purpose: a card that lifts
 * on hover is making a promise that it can be clicked, and applying that to a
 * static container is the fastest way to make an interface feel arbitrary.
 */
export function Card({
  className,
  raised,
  interactive,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean; interactive?: boolean }) {
  return (
    <div
      className={cn(
        raised ? 'surface-raised' : 'surface',
        'rounded-card',
        interactive &&
          'transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-accent/30 hover:shadow-e2 pointer:hover:-translate-y-0.5',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1.5 p-4 sm:p-5', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn('font-display text-base font-semibold leading-snug tracking-tight', className)}
      {...props}
    />
  );
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-sm leading-relaxed text-ink-muted', className)} {...props} />;
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-2 p-4 pt-0 sm:p-5 sm:pt-0', className)} {...props} />;
}
