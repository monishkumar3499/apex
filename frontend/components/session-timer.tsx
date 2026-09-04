'use client';

import * as React from 'react';
import { Play, Pause, RotateCcw, Timer } from 'lucide-react';
import { cn } from '../lib/utils';
import { Hint } from './ui';

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

  /**
   * Wall-clock, not tick-counted.
   *
   * `setInterval` is throttled to about once a minute in a background tab, so
   * a timer that adds one second per tick loses most of a study block the
   * moment the learner switches to the video they are supposed to be watching.
   * Anchoring to a start timestamp keeps the elapsed figure honest.
   */
  const startRef = React.useRef<number | null>(null);
  const baseRef = React.useRef(0);

  React.useEffect(() => {
    if (!running) return;

    startRef.current = Date.now();
    const sync = () => {
      if (startRef.current === null) return;
      setElapsed(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000));
    };

    sync();
    const timer = setInterval(sync, 1000);
    // A throttled tab misses ticks; re-syncing on return corrects the drift
    // in one step rather than leaving the display permanently behind.
    document.addEventListener('visibilitychange', sync);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', sync);
      if (startRef.current !== null) {
        baseRef.current += Math.floor((Date.now() - startRef.current) / 1000);
        startRef.current = null;
      }
    };
  }, [running]);

  const reset = () => {
    baseRef.current = 0;
    startRef.current = null;
    setElapsed(0);
    setRunning(false);
  };

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
        className="inline-flex h-9 items-center gap-1.5 rounded-field border border-line px-3 text-xs font-medium text-ink-muted outline-none transition-colors hover:border-accent/40 hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <Timer className="h-3.5 w-3.5" />
        Start timer
      </button>
    );
  }

  return (
    <div
      className={cn(
        'inline-flex h-9 items-center gap-2 rounded-field border px-2.5 transition-colors',
        reached ? 'border-success/40 bg-success/10' : 'border-accent/30 bg-accent/[0.07]',
      )}
    >
      <Hint label={running ? 'Pause timer' : 'Resume timer'}>
        <button
          onClick={() => setRunning((r) => !r)}
          aria-label={running ? 'Pause timer' : 'Resume timer'}
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60',
            reached ? 'text-success' : 'text-accent',
          )}
        >
          {running ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      </Hint>

      <span
        role="timer"
        aria-live="off"
        className={cn('tabular text-xs font-semibold', reached ? 'text-success' : 'text-accent')}
      >
        {label}
      </span>

      <span aria-hidden className="h-1 w-10 overflow-hidden rounded-full bg-surface-sunken">
        <span
          className={cn(
            'block h-full rounded-full transition-[width] duration-1000 ease-linear',
            reached ? 'bg-success' : 'bg-accent',
          )}
          style={{ width: `${progress}%` }}
        />
      </span>

      <Hint label="Reset timer">
        <button
          onClick={reset}
          aria-label="Reset timer"
          className="flex h-6 w-6 items-center justify-center rounded text-ink-faint outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <RotateCcw className="h-3 w-3" />
        </button>
      </Hint>

      {reached && onComplete && (
        <button
          onClick={onComplete}
          className="ml-0.5 rounded bg-success/15 px-1.5 py-1 text-2xs font-semibold uppercase tracking-wide text-success outline-none transition-colors hover:bg-success/25 focus-visible:ring-2 focus-visible:ring-success/60"
        >
          Done
        </button>
      )}
    </div>
  );
}
