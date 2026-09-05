import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * The Kairo mark.
 *
 * καιρός is the opportune moment — not time passing, but the *right* point on
 * it. So the glyph is an orbit with one node marked on it: the ring is the
 * whole span between now and your deadline, the node is the moment you are in,
 * and the core is the goal everything is circling.
 *
 * Drawn on a 24×24 grid to sit alongside the Lucide icons already in the app,
 * with `currentColor` throughout so it inherits like any other glyph. Stroke
 * widths are set in absolute units rather than scaled, because a mark that
 * thins out at 16px is a mark that vanishes in a browser tab.
 */
export function KairoMark({
  className,
  gradient = false,
  id,
}: {
  className?: string;
  /**
   * Fills the node with the violet→cyan gradient instead of `currentColor`.
   *
   * Off by default: inside a filled accent tile the mark must be a single flat
   * colour or it turns to mud. On is for the mark standing alone on glass.
   */
  gradient?: boolean;
  /** Required when `gradient` is set and more than one mark is on the page. */
  id?: string;
}) {
  // SVG gradient ids are document-global, so two gradient marks on one page
  // with the same id means the second silently inherits the first's stops.
  const gradientId = `kairo-grad-${id ?? 'default'}`;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn('h-full w-full', className)}
    >
      {gradient && (
        <defs>
          <linearGradient id={gradientId} x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
            <stop stopColor="rgb(var(--accent-vivid))" />
            <stop offset="1" stopColor="rgb(var(--accent-2-vivid))" />
          </linearGradient>
        </defs>
      )}

      {/* The span: a full orbit, drawn light. */}
      <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.5" />

      {/*
        The elapsed arc, from the top clockwise to the node. It is what makes
        the mark directional — you can tell at a glance which way time runs.
      */}
      <path
        d="M12 3.75A8.25 8.25 0 0 1 17.83 6.17"
        stroke={gradient ? `url(#${gradientId})` : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
      />

      {/* The moment. */}
      <circle cx="17.83" cy="6.17" r="2.6" fill={gradient ? `url(#${gradientId})` : 'currentColor'} />

      {/* The goal at the centre. */}
      <circle cx="12" cy="12" r="2.1" fill="currentColor" fillOpacity="0.9" />
    </svg>
  );
}

/**
 * Mark plus wordmark.
 *
 * One component so the lockup — glyph size, gap, optical baseline — is defined
 * once. Every place the logo appeared before this existed had its own spacing,
 * and they did not agree.
 */
export function KairoLogo({
  className,
  size = 'md',
  showWord = true,
  id,
}: {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  showWord?: boolean;
  id?: string;
}) {
  const tile = { sm: 'h-7 w-7', md: 'h-8 w-8', lg: 'h-10 w-10' }[size];
  const word = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' }[size];

  return (
    <span className={cn('flex shrink-0 items-center gap-2.5', className)}>
      <span
        className={cn(
          'relative grid place-items-center rounded-[10px] text-accent-vivid',
          // A glass tile rather than a solid accent fill: the mark is the only
          // thing on the page allowed to be iridescent, and a flat violet
          // square behind it would cancel that out.
          //
          // The accent wash is not decoration — plain glass on the dark nav
          // ground gave the tile almost no edge, so the logo read as floating
          // text with a smudge beside it.
          'glass bg-accent/[0.14] shadow-glow ring-1 ring-inset ring-accent/25',
          tile,
        )}
      >
        <KairoMark className="h-[62%] w-[62%]" gradient id={id} />
      </span>

      {showWord && (
        <span
          className={cn(
            'font-display font-semibold tracking-tight text-ink',
            // -0.02em, tuned by eye at 16px. Outfit's default tracking is
            // loose for a five-letter wordmark and it reads as spaced-out.
            '[letter-spacing:-0.02em]',
            word,
          )}
        >
          Kairo
        </span>
      )}
    </span>
  );
}
