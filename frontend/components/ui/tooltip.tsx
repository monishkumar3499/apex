'use client';

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../../lib/utils';

/**
 * Tooltip, on Radix.
 *
 * A tooltip is a fine-pointer affordance: there is no hover on a touch screen,
 * so anything that *only* exists in a tooltip is invisible to half the users.
 * Every call site here labels a control that is already labelled for screen
 * readers — the tooltip is the sighted-mouse convenience, never the only copy.
 */
const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      collisionPadding={10}
      className={cn(
        'surface-raised z-50 max-w-[min(18rem,calc(100vw-2rem))] rounded-lg px-2.5 py-1.5',
        'text-2xs font-medium leading-relaxed text-ink',
        'data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95',
        'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'duration-150',
        className,
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

/**
 * The common case in one component: an element, a string, done.
 *
 * The trigger is `asChild` so it never introduces a wrapper element that could
 * break a flex row's alignment.
 */
export function Hint({
  label,
  children,
  side = 'top',
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} className={className}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
