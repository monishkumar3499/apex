'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * The spine — APEX's signature graphic.
 *
 * The product's whole claim is that it turns a goal into an *ordered route
 * through time*. The spine is that claim drawn: a continuous vertical rail
 * with a node per step, used on every surface that shows sequence — today's
 * items, the build stages, the intake steps, the landing hero.
 *
 * Two implementation notes that decide whether it reads as deliberate:
 *
 *   • The rail is a background on the *list*, not a border on each row, so it
 *     stays continuous across the gaps between cards. Per-row borders produce
 *     a dashed rail that looks like a rendering bug.
 *   • Nodes are opaque and ringed in the page background, so the rail passes
 *     cleanly behind them instead of colliding with their edge.
 *
 * `--spine-x` is the distance from the container's left edge to the centre of
 * the rail. It must match wherever the nodes sit, so it is a CSS variable set
 * once on the container rather than a number repeated in both places.
 */
export function Spine({
  children,
  className,
  x = '0.9375rem',
  live,
  inset,
}: {
  children: React.ReactNode;
  className?: string;
  /** Distance from the left edge to the rail's centre. */
  x?: string;
  /** Runs a highlight down the rail — for work actively in progress. */
  live?: boolean;
  /** Top/bottom inset, so the rail starts and ends at the first/last node. */
  inset?: { top?: string; bottom?: string };
}) {
  return (
    <div
      className={cn('spine', live && 'spine-live', className)}
      style={
        {
          '--spine-x': x,
          ...(inset?.top ? { '--spine-top': inset.top } : {}),
          ...(inset?.bottom ? { '--spine-bottom': inset.bottom } : {}),
        } as React.CSSProperties
      }
    >
      {children}
    </div>
  );
}

type NodeState = 'done' | 'active' | 'pending' | 'error';

/**
 * A single node sitting on the rail.
 *
 * State is carried by fill *and* shape, never by colour alone: done is a
 * filled disc, active is a ringed disc, pending is a small hollow dot. Someone
 * who cannot separate amber from emerald still reads the sequence correctly.
 */
export function SpineNode({
  state = 'pending',
  size = 'md',
  children,
  className,
}: {
  state?: NodeState;
  size?: 'sm' | 'md';
  children?: React.ReactNode;
  className?: string;
}) {
  const dimension = size === 'sm' ? 'h-5 w-5' : 'h-[1.875rem] w-[1.875rem]';

  return (
    <span
      aria-hidden
      className={cn(
        'spine-node relative z-10 flex shrink-0 items-center justify-center rounded-full',
        'transition-colors duration-200',
        dimension,
        state === 'done' && 'bg-success text-white shadow-e1',
        /*
          `accent-vivid`, not `accent`. This node is a filled disc with no text
          in it, so it is held to the 3:1 graphics threshold rather than the
          4.5:1 text one — which is the whole reason the vivid token exists. In
          light mode the AA-safe `accent` renders as a muddy brown here, and
          the brightest element on the screen should not be the dullest colour
          in the palette.
        */
        state === 'active' && 'bg-accent-vivid text-white shadow-e2 ring-4 ring-accent/15',
        state === 'error' && 'bg-danger/12 text-danger ring-1 ring-inset ring-danger/40',
        state === 'pending' && 'bg-surface-2 text-ink-faint ring-1 ring-inset ring-line-strong',
        className,
      )}
    >
      {children}
    </span>
  );
}
