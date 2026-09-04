'use client';

import * as React from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Accordion, on Radix.
 *
 * Used for the unit list on the map and the item list on Today. The height
 * animation is the reason to reach for the primitive rather than a boolean:
 * Radix measures the panel and publishes it as `--radix-accordion-content-height`,
 * which is the only way to animate to `auto` without a ResizeObserver of your
 * own. A section that snaps open makes a long map feel like it is jumping.
 */
const Accordion = AccordionPrimitive.Root;

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => (
  <AccordionPrimitive.Item ref={ref} className={cn('overflow-hidden', className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & { hideChevron?: boolean }
>(({ className, children, hideChevron, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'group flex min-h-touch flex-1 items-center gap-3 text-left outline-none',
        'transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60',
        className,
      )}
      {...props}
    >
      {children}
      {!hideChevron && (
        <ChevronDown
          className="h-4 w-4 shrink-0 text-ink-faint transition-transform duration-200 ease-out group-data-[state=open]:rotate-180"
          aria-hidden
        />
      )}
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content
    ref={ref}
    className={cn(
      'overflow-hidden',
      'data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up',
    )}
    {...props}
  >
    <div className={className}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = 'AccordionContent';

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent };
