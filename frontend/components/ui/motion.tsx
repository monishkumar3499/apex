'use client';

import * as React from 'react';
import { MotionConfig, motion, useReducedMotion, type Variants } from 'motion/react';

/**
 * Motion, used on purpose.
 *
 * The rule this file exists to enforce: animation in Kairo either (a) explains
 * where something came from or went to, or (b) confirms that an action landed.
 * Nothing animates because it looks nice — a study tool that makes a learner
 * wait 400ms for a list to decorate itself is stealing the time it claims to
 * be budgeting.
 *
 * Everything routes through `MotionConfig reducedMotion="user"`, so a learner
 * with the OS setting on gets the final state immediately, with no per-call
 * opt-out to forget.
 */

/** The house timing. Matches the `ease-out` curve used by CSS transitions. */
export const EASE = [0.16, 1, 0.3, 1] as const;

export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.35, ease: EASE }}>
      {children}
    </MotionConfig>
  );
}

/**
 * Screen-level entrance.
 *
 * Replaces the CSS `.animate-in` class the app used everywhere, which fired on
 * every re-render of a server component and could not be staggered.
 */
export function FadeIn({
  children,
  delay = 0,
  y = 8,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'header';
}) {
  const Comp = motion[as];
  return (
    <Comp
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE, delay }}
      className={className}
    >
      {children}
    </Comp>
  );
}

/**
 * Stagger container.
 *
 * `staggerChildren` is deliberately small. Anything over ~60ms on a list of a
 * dozen items means the last card lands most of a second after the first, and
 * the learner is watching an animation instead of reading their day.
 */
export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
};

export function Stagger({
  children,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'ul' | 'ol';
}) {
  const Comp = motion[as];
  return (
    <Comp variants={staggerContainer} initial="hidden" animate="show" className={className}>
      {children}
    </Comp>
  );
}

export function StaggerChild({
  children,
  className,
  as = 'div',
}: {
  children: React.ReactNode;
  className?: string;
  as?: 'div' | 'li';
}) {
  const Comp = motion[as];
  return (
    <Comp variants={staggerItem} className={className}>
      {children}
    </Comp>
  );
}

/**
 * Animates a panel between zero and its natural height.
 *
 * Used for the expandable rows on Today. `height: auto` is the whole trick —
 * Motion measures the content and interpolates to the measured value, which
 * CSS cannot do without a hard-coded max-height that either clips long content
 * or makes short content ease at the wrong rate.
 */
export function Collapsible({
  open,
  children,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.div
      initial={false}
      animate={{ height: open ? 'auto' : 0, opacity: open ? 1 : 0 }}
      transition={
        reduced
          ? { duration: 0 }
          : { height: { duration: 0.28, ease: EASE }, opacity: { duration: open ? 0.25 : 0.12 } }
      }
      // Content taller than the animating box must be clipped, or it spills
      // over the row below for the length of the transition.
      style={{ overflow: 'hidden' }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export { motion, useReducedMotion };
