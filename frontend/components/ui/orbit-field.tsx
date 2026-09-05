'use client';

import * as React from 'react';
import { cn } from '../../lib/utils';

/**
 * The orbit field — Kairo's signature object.
 *
 * A perspective-projected orbital system: concentric rings on different
 * inclinations, each carrying nodes that ride round it and swing back. It is
 * the product's core mechanic drawn literally — a topic is placed once, then
 * returns at 2, 7 and 21 days, which is an orbit rather than a queue.
 *
 * WHY CANVAS 2D AND NOT WEBGL
 *
 * A WebGL scene would render this with real bloom and depth of field, and cost
 * ~150KB gzipped plus a shader compile before the first frame. Kairo is opened
 * every morning, frequently on a mid-range phone, and the thing a learner
 * wants in that first second is today's tasks — not a library booting. Canvas
 * 2D with a pre-rendered glow sprite gets ~90% of the look for zero
 * dependencies and a few hundred bytes, so that is the trade taken.
 *
 * PERFORMANCE, in the order that mattered:
 *
 *   1. The glow sprite is rendered **once** to an offscreen canvas and then
 *      blitted per node. `createRadialGradient` per node per frame allocates
 *      on every frame and is what turns a smooth field into a stuttering one.
 *   2. Ring segments are batched into a handful of depth bands, so a ring is
 *      6 stroke calls rather than 64. The visual difference is nil.
 *   3. The loop does not run when it cannot be seen — an IntersectionObserver
 *      stops it off-screen and `visibilitychange` stops it in a background
 *      tab. An animated background quietly draining battery behind another tab
 *      is the most common version of this component done badly.
 *   4. With `prefers-reduced-motion` it draws exactly one frame and never
 *      starts a loop at all.
 */

interface RingSpec {
  /** Fraction of the field's radius. */
  r: number;
  /** Inclination in radians. ~90° is edge-on, 0 is face-on. */
  incl: number;
  /** Revolutions per second for nodes on this ring. Sign sets direction. */
  speed: number;
  nodes: number;
}

/**
 * Non-uniform radii and widely mismatched inclinations, on purpose.
 *
 * Evenly spaced rings on one plane read as a dartboard. Radii that widen
 * outward read as perspective, and inclinations far apart make each ring a
 * distinct plane — which is what sells the depth.
 *
 * The inclinations are the one number here worth getting right, and the first
 * attempt got it wrong: at ~1.2rad every ring is viewed so close to edge-on
 * that its projected height collapses to about a fifth of its width, all four
 * overlap inside the same thin band, and the whole field renders as a single
 * bright horizontal line. 0.5–0.95rad keeps each one a legible ellipse with
 * clear space between them.
 *
 * Speeds are mutually irrational-ish so the system never returns to its
 * starting arrangement; a field that visibly loops every 12 seconds looks like
 * a GIF.
 */
const RINGS: RingSpec[] = [
  { r: 0.34, incl: 0.62, speed: 0.055, nodes: 3 },
  { r: 0.56, incl: 0.95, speed: -0.037, nodes: 4 },
  { r: 0.78, incl: 0.5, speed: 0.024, nodes: 5 },
  { r: 1.0, incl: 0.82, speed: -0.017, nodes: 4 },
];

/** Depth bands per ring. Six is the point at which banding stops being visible. */
const BANDS = 6;

/** Read an `R G B` custom property into a canvas-ready triple. */
function readChannel(styles: CSSStyleDeclaration, name: string, fallback: string): string {
  const raw = styles.getPropertyValue(name).trim();
  return /^\d+\s+\d+\s+\d+$/.test(raw) ? raw.replace(/\s+/g, ',') : fallback;
}

/**
 * Pre-render the additive glow used for every node.
 *
 * One sprite, drawn once, blitted many times. The gradient is deliberately
 * steep in the centre and long in the tail: that shape is what reads as a
 * light source rather than as a soft circle.
 */
function makeGlowSprite(rgb: string, size: number): HTMLCanvasElement {
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;

  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;

  const half = size / 2;
  const gradient = ctx.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, `rgba(${rgb},1)`);
  gradient.addColorStop(0.12, `rgba(${rgb},0.85)`);
  gradient.addColorStop(0.32, `rgba(${rgb},0.28)`);
  gradient.addColorStop(0.62, `rgba(${rgb},0.06)`);
  gradient.addColorStop(1, `rgba(${rgb},0)`);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

export function OrbitField({
  className,
  /**
   * `lite` halves the node count and drops a ring.
   *
   * Not a quality setting so much as a battery one: on a phone the field is
   * rendered at a third of the size, where the extra ring is invisible anyway.
   */
  density = 'full',
  /** Scales the whole system within its box, 0–1. */
  scale = 0.86,
  /** Dims everything, for use behind live content. */
  intensity = 1,
}: {
  className?: string;
  density?: 'full' | 'lite';
  scale?: number;
  intensity?: number;
}) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rings = density === 'lite' ? RINGS.slice(0, 3) : RINGS;
    const segments = density === 'lite' ? 40 : 64;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let raf = 0;
    let running = false;
    let visible = true;
    let onScreen = true;

    /** Wall-clock phase, advanced only while running so a pause never jumps. */
    let phase = 0;
    let lastTs = 0;

    let violet = '124,92,255';
    let cyan = '34,211,238';
    let glowViolet: HTMLCanvasElement | null = null;
    let glowCyan: HTMLCanvasElement | null = null;

    const SPRITE = 128;

    const readTheme = () => {
      const styles = getComputedStyle(document.documentElement);
      violet = readChannel(styles, '--accent-vivid', '124,92,255');
      cyan = readChannel(styles, '--accent-2-vivid', '34,211,238');
      glowViolet = makeGlowSprite(violet, SPRITE);
      glowCyan = makeGlowSprite(cyan, SPRITE);
    };

    const resize = () => {
      const rect = host.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      // Cap DPR at 2. A 3x phone panel triples the fill cost for a difference
      // nobody can see on a soft glow.
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    /**
     * Project a point on a ring to screen space.
     *
     * The circle starts in the XY plane, is rotated about X by the ring's
     * inclination, then the whole system is rotated about Y by the global
     * phase. `z` comes back out so the caller can sort and shade by depth.
     */
    const project = (
      r: number,
      theta: number,
      incl: number,
      spin: number,
      cx: number,
      cy: number,
      focal: number,
    ) => {
      const cosI = Math.cos(incl);
      const sinI = Math.sin(incl);

      const x0 = r * Math.cos(theta);
      const y0 = r * Math.sin(theta) * cosI;
      const z0 = r * Math.sin(theta) * sinI;

      const cosS = Math.cos(spin);
      const sinS = Math.sin(spin);
      const x1 = x0 * cosS + z0 * sinS;
      const z1 = -x0 * sinS + z0 * cosS;

      // `focal` arrives in PIXELS, not in radius-multiples.
      //
      // This is the one line that has to be dimensionally consistent, and the
      // first version was not: `focal` was set to 3.1 while `z1` is a pixel
      // offset in the hundreds, so `focal - z1` went sharply negative and the
      // whole system collapsed onto a single horizontal line. The caller now
      // scales it by the field radius.
      const depth = focal / (focal - z1);

      // `y0` is unchanged by the Y-axis spin — that is what makes the spin a
      // rotation of the whole system rather than a wobble.
      return { x: cx + x1 * depth, y: cy + y0 * depth, z: z1, depth };
    };

    const draw = () => {
      const cx = width / 2;
      const cy = height / 2;
      // The field radius, in px, that `r: 1.0` maps to.
      const R = (Math.min(width, height) / 2) * scale;
      /*
        Camera distance, as a multiple of the field radius, converted to px.

        Lower is a wider lens and a more dramatic near/far contrast; below
        about 2 the near side of the outer ring distorts badly, and above about
        5 the projection is so close to orthographic that the depth cue is lost
        and the rings read as flat ellipses again.
      */
      const focal = R * 3.1;

      ctx.clearRect(0, 0, width, height);
      // Additive blending: overlapping glows brighten rather than occlude,
      // which is how light actually behaves and is the single biggest reason
      // this reads as luminous instead of as flat stickers.
      ctx.globalCompositeOperation = 'lighter';

      const spin = phase * 0.06;
      const nodes: Array<{ x: number; y: number; depth: number; z: number; hot: boolean; ring: number }> = [];

      // ---- rings, batched into depth bands ------------------------------
      rings.forEach((ring, ringIndex) => {
        const points = Array.from({ length: segments + 1 }, (_, i) => {
          const theta = (i / segments) * Math.PI * 2;
          return project(ring.r * R, theta, ring.incl, spin, cx, cy, focal);
        });

        // Bands are keyed on the segment midpoint's depth, so a segment
        // crossing behind the centre dims across its own length.
        for (let band = 0; band < BANDS; band++) {
          ctx.beginPath();
          let drew = false;

          for (let i = 0; i < segments; i++) {
            const a = points[i];
            const b = points[i + 1];
            // 0 at the far side, 1 at the near side.
            const t = (a.z + b.z) / (2 * ring.r * R) * 0.5 + 0.5;
            if (Math.floor(t * BANDS) !== band) continue;
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            drew = true;
          }

          if (!drew) continue;

          const t = (band + 0.5) / BANDS;
          // The near side of a ring is brighter and thicker. That gradient
          // along a single closed curve is what makes a flat ellipse read as
          // a circle in space.
          ctx.strokeStyle = `rgba(${ringIndex % 2 ? cyan : violet},${(0.07 + t * 0.38) * intensity})`;
          ctx.lineWidth = 0.7 + t * 1.3;
          ctx.stroke();
        }

        // ---- nodes on this ring -----------------------------------------
        for (let n = 0; n < ring.nodes; n++) {
          const theta = (n / ring.nodes) * Math.PI * 2 + phase * ring.speed * Math.PI * 2;
          const p = project(ring.r * R, theta, ring.incl, spin, cx, cy, focal);
          nodes.push({
            ...p,
            // One node per ring is a "review due" marker and pulses. It is the
            // spaced-repetition return made visible.
            hot: n === 0,
            ring: ringIndex,
          });
        }
      });

      // ---- the core -----------------------------------------------------
      // Drawn before the nodes so a near node passes in front of it.
      if (glowViolet) {
        const breathe = 0.86 + Math.sin(phase * 0.9) * 0.14;
        const size = R * 0.5 * breathe;
        ctx.globalAlpha = 0.5 * intensity;
        ctx.drawImage(glowViolet, cx - size / 2, cy - size / 2, size, size);
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(cx, cy, Math.max(2, R * 0.022), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${0.85 * intensity})`;
        ctx.fill();
      }

      // ---- nodes, far to near -------------------------------------------
      nodes.sort((a, b) => a.z - b.z);

      for (const node of nodes) {
        const sprite = node.ring % 2 ? glowCyan : glowViolet;
        if (!sprite) continue;

        // 0 at the far side, 1 at the near side.
        const t = Math.min(1, Math.max(0, (node.depth - 0.75) / 0.7));
        const pulse = node.hot ? 1 + Math.sin(phase * 2.1 + node.ring) * 0.28 : 1;
        const size = R * (0.11 + t * 0.1) * pulse;

        ctx.globalAlpha = (0.3 + t * 0.7) * intensity;
        ctx.drawImage(sprite, node.x - size / 2, node.y - size / 2, size, size);

        // A hard centre inside the glow. Without it a node is a smudge; with
        // it, it is an object that happens to be glowing.
        ctx.globalAlpha = (0.45 + t * 0.55) * intensity;
        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(0.8, R * (0.008 + t * 0.011)), 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };

    const tick = (ts: number) => {
      if (!running) return;
      // Delta-timed rather than frame-counted, so the field turns at the same
      // rate on a 60Hz laptop and a 120Hz phone. Clamped, because a tab that
      // was backgrounded returns with a delta measured in seconds and the
      // system would visibly jump.
      const delta = lastTs ? Math.min((ts - lastTs) / 1000, 0.05) : 0;
      lastTs = ts;
      phase += delta;
      draw();
      raf = requestAnimationFrame(tick);
    };

    const sync = () => {
      const should = visible && onScreen && !reduced;
      if (should === running) return;

      running = should;
      if (running) {
        lastTs = 0;
        raf = requestAnimationFrame(tick);
      } else {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    readTheme();
    resize();
    draw();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      draw();
    });
    resizeObserver.observe(host);

    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry.isIntersecting;
        sync();
      },
      // Start a beat before it scrolls into view, so it is never caught
      // mid-stall at the moment it appears.
      { rootMargin: '120px' },
    );
    intersectionObserver.observe(host);

    const onVisibility = () => {
      visible = document.visibilityState === 'visible';
      sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    // The theme toggle swaps a class on <html>; the sprites and stroke colours
    // are baked from CSS variables, so they have to be rebuilt when it does.
    const themeObserver = new MutationObserver(() => {
      readTheme();
      draw();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    sync();

    return () => {
      cancelAnimationFrame(raf);
      running = false;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      themeObserver.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [density, scale, intensity]);

  return (
    <div ref={hostRef} aria-hidden className={cn('pointer-events-none absolute inset-0', className)}>
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
