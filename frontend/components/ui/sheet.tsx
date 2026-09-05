'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cva, type VariantProps } from 'class-variance-authority';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';

/**
 * Edge-anchored panel — the mobile navigation drawer, and any filter surface
 * that wants the whole side of the screen on a phone.
 *
 * Built on Radix Dialog rather than a positioned div so it gets the same focus
 * trap, escape handling and scroll lock as a modal. A drawer without a focus
 * trap silently drops keyboard users behind it into the page underneath.
 */
const Sheet = DialogPrimitive.Root;
const SheetTrigger = DialogPrimitive.Trigger;
const SheetClose = DialogPrimitive.Close;
const SheetPortal = DialogPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/60 backdrop-blur-md',
      'data-[state=open]:animate-in data-[state=open]:fade-in-0',
      'data-[state=closed]:animate-out data-[state=closed]:fade-out-0',
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const sheetVariants = cva(
  cn(
    'fixed z-50 flex flex-col gap-0 bg-bg/85 shadow-e4 backdrop-blur-2xl transition ease-out',
    'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300',
  ),
  {
    variants: {
      side: {
        left: cn(
          'inset-y-0 left-0 h-full w-[min(19rem,88vw)] border-r border-line pt-safe',
          'data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left',
        ),
        right: cn(
          'inset-y-0 right-0 h-full w-[min(19rem,88vw)] border-l border-line pt-safe',
          'data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right',
        ),
        bottom: cn(
          'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-panel border-t border-line pb-safe',
          'data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom',
        ),
        top: cn(
          'inset-x-0 top-0 max-h-[85dvh] rounded-b-panel border-b border-line pt-safe',
          'data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top',
        ),
      },
    },
    defaultVariants: { side: 'left' },
  },
);

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> &
    VariantProps<typeof sheetVariants> & { showClose?: boolean }
>(({ side, className, children, showClose = true, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content ref={ref} className={cn(sheetVariants({ side }), className)} {...props}>
      {children}
      {showClose && (
        <DialogPrimitive.Close
          className={cn(
            'absolute right-3 top-[calc(0.75rem+env(safe-area-inset-top,0px))] flex h-9 w-9 items-center justify-center',
            'rounded-field text-ink-faint transition-colors hover:bg-glass/[0.08] hover:text-ink',
            'outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          )}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex shrink-0 items-center gap-2 border-b border-line px-4 py-3 pr-12', className)}
      {...props}
    />
  );
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('font-display text-sm font-semibold tracking-tight', className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-xs text-ink-muted', className)} {...props} />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetPortal,
  SheetOverlay,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
};
