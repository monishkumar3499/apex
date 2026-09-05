'use client';

import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../../lib/utils';

/*
  Form controls.

  The shared rule across all of them: `text-base` up to `sm`, `text-sm` above.
  iOS Safari zooms the viewport when a control smaller than 16px receives
  focus and never zooms back out, so every input on a phone has to be 16px.
*/

const CONTROL = cn(
  'w-full rounded-xl border border-glass-edge/[0.1] bg-glass/[0.04] text-ink backdrop-blur-sm',
  'outline-none transition-[border-color,box-shadow] duration-150',
  'placeholder:text-ink-faint',
  'focus:border-accent/60 focus:ring-2 focus:ring-accent/20',
  'disabled:cursor-not-allowed disabled:opacity-55',
  'text-base sm:text-sm',
);

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <input
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      CONTROL,
      'h-12 px-3.5 sm:h-11',
      invalid && 'border-danger/60 focus:border-danger focus:ring-danger/20',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }
>(({ className, invalid, ...props }, ref) => (
  <textarea
    ref={ref}
    aria-invalid={invalid || undefined}
    className={cn(
      CONTROL,
      'resize-none px-3.5 py-3',
      invalid && 'border-danger/60 focus:border-danger focus:ring-danger/20',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      'text-sm font-medium leading-none text-ink peer-disabled:opacity-55',
      className,
    )}
    {...props}
  />
));
Label.displayName = 'Label';

/**
 * Label + control + optional hint and error, wired together.
 *
 * The point of the component is the wiring: the label's `htmlFor`, the hint's
 * id in `aria-describedby`, and the error's `role="alert"`. Done by hand at
 * each call site, one of those three is always missing.
 */
export function FormField({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
  labelAction,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
  /** Secondary control that belongs beside the label, e.g. a live total. */
  labelAction?: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <Label htmlFor={htmlFor}>{label}</Label>
        {labelAction}
      </div>
      {children}
      {hint && !error && (
        <p id={htmlFor ? `${htmlFor}-hint` : undefined} className="mt-2 text-xs leading-relaxed text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs leading-relaxed text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
