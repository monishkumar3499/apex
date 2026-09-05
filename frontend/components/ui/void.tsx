import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * Layer 0 — the void.
 *
 * A slow aurora drifting through near-black indigo, with optional film grain
 * and a perspective floor grid. This is the ground everything else floats
 * above, and it is the reason the glass reads as glass: frosted panels over a
 * flat colour look like grey boxes, while frosted panels over moving light
 * look like a material.
 *
 * Deliberately a **server component with zero JavaScript**. The whole effect is
 * two pseudo-elements and a pair of CSS animations, so it costs nothing in the
 * bundle, nothing on hydration, and runs entirely on the compositor. A daily-use
 * study app should not spend main-thread time on its background.
 *
 * `aria-hidden` plus `pointer-events: none` throughout: this is decoration, and
 * decoration must be invisible to a screen reader and untouchable by a pointer.
 */
export function Void({
  variant = 'ambient',
  grid = false,
  className,
}: {
  /**
   * `hero`    full-strength, for a landing or empty-state stage
   * `ambient` restrained, for the app chrome behind real content
   * `focus`   a single pool of light from above, for a reading pane
   */
  variant?: 'hero' | 'ambient' | 'focus';
  /** Adds the receding floor grid. Hero surfaces only — it is loud. */
  grid?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 overflow-hidden',
        // The aurora is the loudest thing on the page and content sits on top
        // of it, so ambient surfaces run it at well under half strength. A
        // background that competes with the text is a background that failed.
        variant === 'ambient' && '[--aurora-alpha:0.09]',
        variant === 'focus' && '[--aurora-alpha:0.06]',
        className,
      )}
    >
      <div className="aurora" />

      {/*
        A vignette pulls the eye to the middle and, more usefully, guarantees
        contrast at the edges where the aurora is brightest. Without it, a
        nav item can land on top of a violet bloom and lose its contrast
        ratio at some viewport widths but not others.
      */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_0%,transparent_35%,rgb(var(--bg)/0.55)_100%)]" />

      {variant === 'focus' && (
        <div className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(var(--accent)/0.14),transparent_70%)]" />
      )}

      {grid && <div className="depth-grid" />}

      {/* Grain last, so it dithers the gradient banding of everything above. */}
      <div className="grain absolute inset-0" />
    </div>
  );
}

/**
 * Concentric orbit rings, in pure CSS.
 *
 * The cheap version of `OrbitField` — no canvas, no JavaScript, no measuring.
 * Used wherever the orbit motif should be *present* rather than the subject:
 * empty states, section anchors, the sign-in page, behind a stat.
 *
 * Rings counter-rotate against their neighbours. That is what makes four
 * circles read as a system with depth rather than as a spinning target; the
 * eye reads opposed motion as separate planes.
 */
export function OrbitRings({
  className,
  count = 4,
  lit = 1,
}: {
  className?: string;
  /** How many rings. Beyond five it stops reading as depth and starts as moiré. */
  count?: number;
  /** How many of the innermost rings carry the accent bloom. */
  lit?: number;
}) {
  // Non-uniform spacing. Evenly spaced rings read as a flat target; spacing
  // that widens outward reads as perspective.
  const sizes = [30, 52, 76, 100, 128];
  const spins = ['animate-orbit-fast', 'animate-orbit-mid', 'animate-orbit-slow', 'animate-orbit-mid'];

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0', className)}>
      {Array.from({ length: Math.min(count, sizes.length) }, (_, i) => (
        <div
          key={i}
          className={cn(
            'orbit-ring',
            i < lit && 'orbit-ring-lit',
            spins[i % spins.length],
            // A dashed ring on one plane only. A single break in the pattern
            // is what tells the eye which ring is nearest.
            i === 1 && 'border-dashed',
          )}
          style={{
            width: `${sizes[i]}%`,
            height: `${sizes[i]}%`,
            // Negative delays start each ring mid-cycle, so they are never
            // momentarily aligned on first paint.
            animationDelay: `-${i * 7}s`,
          }}
        />
      ))}
    </div>
  );
}
