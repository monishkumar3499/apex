'use client';

import * as React from 'react';
import { cn } from '../lib/utils';
import { Loader2 } from 'lucide-react';

/* ---------------------------------------------------------------- Button */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-accent-fg hover:bg-accent-hover shadow-sm hover:shadow active:translate-y-px',
  secondary:
    'bg-surface-2 text-ink border border-line hover:border-line-strong hover:bg-surface-3',
  outline:
    'border border-line-strong text-ink hover:bg-surface-2',
  ghost:
    'text-ink-muted hover:text-ink hover:bg-surface-2',
  danger:
    'bg-danger/12 text-danger border border-danger/25 hover:bg-danger/20',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-150',
        'disabled:opacity-45 disabled:pointer-events-none select-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

/* ------------------------------------------------------------------ Card */

export function Card({
  className,
  raised,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { raised?: boolean }) {
  return (
    <div
      className={cn(raised ? 'surface-raised' : 'surface', 'rounded-card', className)}
      {...props}
    />
  );
}

/* ----------------------------------------------------------------- Badge */

export function Badge({
  className,
  tone = 'muted',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: string }) {
  const tones: Record<string, string> = {
    accent: 'bg-accent/12 text-accent border-accent/25',
    info: 'bg-info/12 text-info border-info/25',
    success: 'bg-success/12 text-success border-success/25',
    warn: 'bg-warn/12 text-warn border-warn/25',
    danger: 'bg-danger/12 text-danger border-danger/25',
    muted: 'bg-surface-2 text-ink-muted border-line',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide',
        tones[tone] ?? tones.muted,
        className,
      )}
      {...props}
    />
  );
}

/* -------------------------------------------------------------- Progress */

export function Progress({
  value,
  className,
  tone = 'accent',
  showTrack = true,
}: {
  value: number;
  className?: string;
  tone?: 'accent' | 'success' | 'info';
  showTrack?: boolean;
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const bar = { accent: 'bg-accent', success: 'bg-success', info: 'bg-info' }[tone];

  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn('h-1.5 w-full overflow-hidden rounded-full', showTrack && 'bg-surface-3', className)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', bar)}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/** Circular progress used for the day/plan completion dials. */
export function Dial({
  value,
  size = 44,
  stroke = 4,
  children,
  tone = 'accent',
}: {
  value: number;
  size?: number;
  stroke?: number;
  children?: React.ReactNode;
  tone?: 'accent' | 'success';
}) {
  const clamped = Math.max(0, Math.min(100, value));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          className="stroke-surface-3"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
          className={cn('transition-[stroke-dashoffset] duration-700 ease-out',
            tone === 'success' ? 'stroke-success' : 'stroke-accent')}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-2xs font-semibold tabular">
        {children ?? `${clamped}%`}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-lg', className)} />;
}

/* ----------------------------------------------------------------- Modal */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="surface-raised relative w-full max-w-md rounded-panel p-6 animate-scale-in"
      >
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {description && <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{description}</p>}
        {children && <div className="mt-4">{children}</div>}
        {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Empty state */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-panel border border-dashed border-line px-6 py-14 text-center">
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-surface-2 text-ink-faint">
          {icon}
        </div>
      )}
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
