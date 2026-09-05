'use client';

import * as React from 'react';
import { useReducedMotion } from 'motion/react';
import { cn } from '../../lib/utils';

/**
 * A surface that tilts toward the pointer.
 *
 * The one gesture that makes a flat panel feel like an object: parallax
 * response to where you are looking. The panel rotates a couple of degrees
 * toward the cursor and a specular highlight tracks it, so the light appears
 * to come from the pointer.
 *
 * Three rules it follows, each of which is the difference between "premium"
 * and "gimmick":
 *
 *   • **Small.** Six degrees maximum. A card that swings twenty degrees stops
 *     being a surface and becomes a toy, and the text on it becomes hard to
 *     read at exactly the moment the reader leaned in.
 *   • **Pointer only.** There is no hover on a touchscreen. A tilt driven by
 *     touch either does nothing or latches on after a tap and looks broken, so
 *     it is not wired up at all below the `pointer: fine` line.
 *   • **Compositor only.** The pointer handler writes two CSS custom
 *     properties and nothing else. No React state, no re-render, no layout —
 *     the transform itself is declared in CSS (`.tilt-3d`) and stays on the
 *     GPU. Driving this through `useState` would re-render the subtree on
 *     every mouse move.
 */
export function Tilt({
  children,
  className,
  max = 6,
  lift = 10,
  glare = true,
  perspective = 900,
  as: Comp = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  /** Maximum rotation in degrees, per axis. */
  max?: number;
  /** How far the panel rises toward the viewer, in px. */
  lift?: number;
  /** Track a specular highlight with the pointer. */
  glare?: boolean;
  perspective?: number;
  as?: 'div' | 'article' | 'li' | 'section';
}) {
  const ref = React.useRef<HTMLDivElement | null>(null);
  const frame = React.useRef(0);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    const node = ref.current;
    if (!node || reduced) return;

    // No hover means no tilt. Checked here rather than in CSS because the
    // listeners themselves are what we want to avoid attaching.
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    const write = (rx: number, ry: number, gx: number, gy: number, on: boolean) => {
      node.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
      node.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
      node.style.setProperty('--tz', on ? `${lift}px` : '0px');
      if (glare) {
        node.style.setProperty('--gx', `${gx.toFixed(1)}%`);
        node.style.setProperty('--gy', `${gy.toFixed(1)}%`);
        node.style.setProperty('--glare', on ? '1' : '0');
      }
    };

    const onMove = (event: PointerEvent) => {
      // Coalesce to one write per frame. A high-polling-rate mouse fires
      // pointermove far more often than the display refreshes, and every
      // extra style write is a wasted style recalculation.
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        const rect = node.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        // -0.5 … 0.5, measured from the centre.
        const px = (event.clientX - rect.left) / rect.width - 0.5;
        const py = (event.clientY - rect.top) / rect.height - 0.5;

        // Y-rotation follows horizontal movement; X-rotation is inverted so
        // that pushing the pointer *up* tips the top of the card away, which
        // is what a physical panel pinned at its centre would do.
        write(-py * max * 2, px * max * 2, (px + 0.5) * 100, (py + 0.5) * 100, true);
      });
    };

    const onLeave = () => {
      if (frame.current) {
        cancelAnimationFrame(frame.current);
        frame.current = 0;
      }
      // Back to flat. The CSS transition on `.tilt-3d` handles the easing, so
      // the release settles rather than snapping.
      write(0, 0, 50, 50, false);
    };

    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerleave', onLeave);
    // A pointer leaving the window never fires pointerleave on the node.
    window.addEventListener('blur', onLeave);

    return () => {
      node.removeEventListener('pointermove', onMove);
      node.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('blur', onLeave);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [max, lift, glare, reduced]);

  return (
    <Comp
      ref={ref as never}
      className={cn('tilt-3d transform-3d', glare && 'relative isolate', className)}
      style={{ '--tilt-perspective': `${perspective}px` } as React.CSSProperties}
    >
      {children}

      {glare && !reduced && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[var(--glare,0)] transition-opacity duration-300 ease-out"
          style={{
            // A radial highlight parked at the pointer. `--gx/--gy` default to
            // the centre so the very first frame after mount is not offset.
            background:
              'radial-gradient(38% 38% at var(--gx, 50%) var(--gy, 50%), rgb(var(--glass-bg) / 0.16), transparent 70%)',
          }}
        />
      )}
    </Comp>
  );
}

/**
 * A card that flips in 3D between two faces.
 *
 * Written for the drill screen, where the question/answer reveal is the whole
 * interaction. A flip is the right motion there because it is *reversible* and
 * preserves position: the answer is on the back of the same card, not on a new
 * screen, so the learner never loses their place.
 *
 * Both faces are always rendered and `backface-visibility: hidden` hides the
 * one facing away. Conditionally rendering them instead would mean the
 * incoming face has no layout until mid-flip, and the card visibly collapses.
 */
export function FlipCard({
  flipped,
  front,
  back,
  className,
  faceClassName,
}: {
  flipped: boolean;
  front: React.ReactNode;
  back: React.ReactNode;
  className?: string;
  faceClassName?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <div className={cn('perspective-1200 relative', className)}>
      <div
        className={cn(
          'relative transform-3d transition-transform duration-500 ease-out',
          // With reduced motion the rotation is skipped entirely: a
          // half-second 180° spin is precisely what that setting exists to
          // prevent. The faces still swap, just instantly.
          reduced && 'transition-none',
        )}
        style={{ transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}
      >
        <div className={cn('backface-hidden', faceClassName)}>{front}</div>

        <div
          className={cn('absolute inset-0 backface-hidden', faceClassName)}
          style={{ transform: 'rotateY(180deg)' }}
        >
          {back}
        </div>
      </div>
    </div>
  );
}
