import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

/** 135 → "2h 15m". Used everywhere study time is shown. */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m}m`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...opts,
  });
}

/** "Today" / "Tomorrow" / "3 days ago" / a date. */
export function relativeDay(iso: string): string {
  const target = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);

  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  if (days < 0) return `${Math.abs(days)} days ago`;
  if (days < 7) return target.toLocaleDateString('en-US', { weekday: 'long' });
  return formatDate(iso);
}

export const todayIso = (): string => {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
};

export const pct = (done: number, total: number): number =>
  total > 0 ? Math.round((done / total) * 100) : 0;

/** Colour + label for each kind of scheduled work. */
export const ITEM_META = {
  learn: { label: 'Learn', tone: 'accent', icon: 'BookOpen' },
  practice: { label: 'Practice', tone: 'info', icon: 'PenLine' },
  review: { label: 'Review', tone: 'info', icon: 'RotateCcw' },
  project: { label: 'Build', tone: 'success', icon: 'Hammer' },
  assess: { label: 'Checkpoint', tone: 'warn', icon: 'Flag' },
  mock: { label: 'Mock', tone: 'danger', icon: 'Timer' },
  buffer: { label: 'Catch-up', tone: 'muted', icon: 'Coffee' },
} as const;

export type ItemKind = keyof typeof ITEM_META;

export const TONE_CLASSES: Record<string, string> = {
  accent: 'bg-accent/12 text-accent border-accent/25',
  info: 'bg-info/12 text-info border-info/25',
  success: 'bg-success/12 text-success border-success/25',
  warn: 'bg-warn/12 text-warn border-warn/25',
  danger: 'bg-danger/12 text-danger border-danger/25',
  muted: 'bg-surface-3 text-ink-muted border-line',
};
