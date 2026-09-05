'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * The one button.
 *
 * `asChild` exists because half the buttons in this app are really links —
 * "Build my prep map", "Drill this topic". Wrapping a `<Link>` in a `<button>`
 * produces a button inside an anchor, which is invalid and breaks keyboard
 * activation; `asChild` merges the styles onto the anchor instead.
 */
const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap font-medium',
    'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out',
    'outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
    'disabled:pointer-events-none disabled:opacity-45',
    // touch-manipulation removes the ~300ms delay mobile browsers add while
    // they wait to see whether a tap is the start of a double-tap zoom.
    'select-none touch-manipulation active:scale-[0.98]',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        /**
         * The one filled button. Carries the accent bloom, because on Aurora
         * Glass "the primary action" is expressed as the brightest thing on
         * the screen rather than as the only coloured rectangle.
         *
         * `ring-inset` supplies the specular top edge. Without it a filled
         * button is the one element on a glass page with no material to it.
         */
        primary: cn(
          'bg-accent text-accent-fg ring-1 ring-inset ring-glass-edge/20',
          'shadow-glow hover:bg-accent-hover hover:shadow-glow-lg',
        ),
        /** Frosted. The default for anything that is not the primary action. */
        secondary: 'glass text-ink hover:border-accent/30 hover:text-accent hover:shadow-glow',
        outline: cn(
          'border border-line-strong bg-transparent text-ink backdrop-blur-sm',
          'hover:border-accent/40 hover:bg-glass/[0.06] hover:text-accent',
        ),
        ghost: 'text-ink-muted hover:bg-glass/[0.08] hover:text-ink',
        danger: 'border border-danger/25 bg-danger/12 text-danger backdrop-blur-sm hover:bg-danger/20',
        /** Reads as a link, keeps the button hit-area and focus ring. */
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        // Taller on touch, tightened once a fine pointer is likely.
        sm: 'h-9 rounded-field px-3 text-xs sm:h-8 [&_svg]:size-3.5',
        md: 'h-11 rounded-xl px-4 text-sm sm:h-10 [&_svg]:size-4',
        lg: 'h-12 rounded-xl px-5 text-base sm:px-6 [&_svg]:size-4',
        /** Square icon-only target that still clears WCAG 2.5.8. */
        icon: 'h-touch w-touch rounded-field [&_svg]:size-4',
        'icon-sm': 'h-9 w-9 rounded-field [&_svg]:size-4',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    // A Slot must receive exactly one child, so the spinner cannot be injected
    // alongside it. Link-shaped buttons never show a loading state anyway.
    const Comp = asChild ? Slot : 'button';

    return (
      <Comp
        ref={ref}
        disabled={asChild ? undefined : disabled || loading}
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
