'use client';

import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '../../lib/utils';

/**
 * Slider, on Radix.
 *
 * `<input type="range">` styles differently in every engine, gives no control
 * over the thumb's hit area, and on a phone its thumb is roughly 16px — well
 * under the 44px touch minimum, so the capacity step was genuinely fiddly to
 * set. This thumb is a 44px target with a visible 20px cap, and arrow keys,
 * Home/End and Page Up/Down all work.
 */
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      'relative flex w-full touch-none select-none items-center py-3',
      'data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-surface-sunken">
      <SliderPrimitive.Range className="absolute h-full rounded-full bg-accent" />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      className={cn(
        // The visible cap is 20px; the padded box around it is the real target.
        'block h-5 w-5 rounded-full border-2 border-accent bg-surface shadow-e2',
        'transition-[box-shadow,transform] duration-150 ease-out',
        'hover:scale-110 active:scale-105',
        'outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'after:absolute after:-inset-3 after:content-[""]',
      )}
    />
  </SliderPrimitive.Root>
));
Slider.displayName = SliderPrimitive.Root.displayName;
