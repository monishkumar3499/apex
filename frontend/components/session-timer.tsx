'use client';

import * as React from 'react';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import { cn } from '../lib/utils';

/**
 * Study timer for a single item.
 *
 * Counts up rather than down: a countdown that hits zero mid-thought tells the
 * learner to stop, which is the opposite of what deep work wants. The estimate
 * is shown as a target line, and passing it is fine.
 */
export function SessionTimer({
  minutes,
  onComplete,
}: {
  minutes: number;
  onComplete?: () => void;
}) {
  const [elapsed, setElapsed] = React.useState(0);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  const target = minutes * 60;
  const progress = Math.min(100, (elapsed / Math.max(1, target)) * 100);
  const reached = elapsed >= target;

  const label = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

  if (!running && elapsed === 0) {
    return (
      <button
        onClick={() => setRunning(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-medium text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
      >
        <Timer className="h-3.5 w-3.5" />
        Start timer
      </button>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex h-8 items-center gap-2 rounded-lg border px-2.5 transition-colors',
        reached ? 'border-success/40 bg-success/10' : 'border-accent/30 bg-accent/[0.07]',
      )}
    >
      <button
        onClick={() => setRunning((r) => !r)}
        aria-label={running ? 'Pause timer' : 'Resume timer'}
        className={cn('transition-colors', reached ? 'text-success' : 'text-accent')}
      >
        {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>

      <span className={cn('tabular text-xs font-semibold', reached ? 'text-success' : 'text-accent')}>
        {label}
      </span>

      <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-3">
        <span
          className={cn('block h-full rounded-full transition-[width] duration-1000 ease-linear',
            reached ? 'bg-success' : 'bg-accent')}
          style={{ width: `${progress}%` }}
        />
      </span>

      <button
        onClick={() => { setElapsed(0); setRunning(false); }}
        aria-label="Reset timer"
        className="text-ink-faint transition-colors hover:text-ink"
      >
        <RotateCcw className="h-3 w-3" />
      </button>

      {reached && onComplete && (
        <button
          onClick={onComplete}
          className="ml-0.5 rounded bg-success/15 px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide text-success transition-colors hover:bg-success/25"
        >
          Done
        </button>
      )}
    </div>
  );
}
