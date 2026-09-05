'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  CalendarDays, Layers, Library, Brain, MessageSquare, LineChart,
  ChevronLeft, Flame, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { cn, pct } from '../lib/utils';
import {
  KairoLogo, Progress, Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, Hint,
} from './ui';
import { ThemeToggle, RAIL_KEY } from './theme';
import { UserMenu } from './user-menu';

const NAV = [
  { slug: 'today', label: 'Today', icon: CalendarDays, hint: 'What to study right now' },
  { slug: 'map', label: 'Map', icon: Layers, hint: 'The whole plan, unit by unit' },
  { slug: 'drill', label: 'Drill', icon: Brain, hint: 'Spaced recall practice' },
  { slug: 'coach', label: 'Coach', icon: MessageSquare, hint: 'Ask about your plan' },
  { slug: 'library', label: 'Library', icon: Library, hint: 'Every resource in one place' },
  { slug: 'progress', label: 'Progress', icon: LineChart, hint: 'Pace, streaks and mastery' },
];

/** The four that earn a permanent thumb-reachable slot on a phone. */
const TAB_BAR = NAV.slice(0, 4);
const DRAWER_ONLY = new Set(['library', 'progress']);

const PACE: Record<string, { label: string; className: string }> = {
  ahead: { label: 'Ahead', className: 'text-cyan' },
  'on-track': { label: 'On pace', className: 'text-success' },
  slipping: { label: 'Slipping', className: 'text-warn' },
  behind: { label: 'Behind', className: 'text-danger' },
};

export interface SidebarPlan {
  id: string;
  title: string;
  totalItems: number;
  doneItems: number;
  startDate: string;
  targetDate: string;
}

export function PlanSidebar({
  plan,
  streak,
  paceStatus,
  user,
}: {
  plan: SidebarPlan;
  streak: number;
  paceStatus: string;
  user: { name: string | null; email: string | null; avatarUrl: string | null };
}) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  /**
   * Rail collapsed?
   *
   * Initialised from the DOM rather than from localStorage, because the
   * blocking script in `theme.tsx` has already applied the stored value to
   * `<html data-rail>` before React runs. Reading storage again here would be a
   * second source of truth that could disagree with what is on screen.
   *
   * `useState(false)` on the server and a `useEffect` sync on the client: the
   * markup is identical either way, since the width comes from CSS.
   */
  const [mini, setMini] = React.useState(false);

  React.useEffect(() => {
    setMini(document.documentElement.getAttribute('data-rail') === 'mini');
  }, []);

  const toggleRail = React.useCallback(() => {
    setMini((current) => {
      const next = !current;
      if (next) document.documentElement.setAttribute('data-rail', 'mini');
      else document.documentElement.removeAttribute('data-rail');
      try {
        localStorage.setItem(RAIL_KEY, next ? 'mini' : 'full');
      } catch {
        /* private mode */
      }
      return next;
    });
  }, []);

  React.useEffect(() => { setOpen(false); }, [pathname]);

  const progress = pct(plan.doneItems, plan.totalItems);
  const pace = PACE[paceStatus] ?? PACE['on-track'];

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(`${plan.targetDate}T00:00:00`).getTime() - Date.now()) / 86_400_000),
  );

  const currentSection = NAV.find((n) => pathname?.endsWith(`/${n.slug}`));
  const isMoreActive = Boolean(currentSection && DRAWER_ONLY.has(currentSection.slug));

  const planHead = (
    <div className="px-3 pt-3">
      <div className="glass relative overflow-hidden rounded-card p-3.5">
        {/* The rail's one accent surface, so "which plan am I in" is the first
            thing the eye lands on rather than something to hunt for. */}
        <div className="holo-rule absolute inset-x-0 top-0" />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_100%_at_0%_0%,rgb(var(--accent)/0.1),transparent_65%)]"
        />

        <div className="relative">
          <h2 className="line-clamp-2 font-display text-sm font-semibold leading-snug tracking-tight">
            {plan.title}
          </h2>

          <div className="mt-3 flex items-baseline justify-between gap-2">
            <span className="font-mono text-xl font-semibold tracking-tight">
              {progress}
              <span className="text-xs text-ink-faint">%</span>
            </span>
            <span className={cn('text-2xs font-semibold uppercase tracking-wider', pace.className)}>
              {pace.label}
            </span>
          </div>

          <Progress value={progress} className="mt-2.5" label={`Plan progress: ${progress}%`} />

          <p className="mt-2.5 font-mono text-2xs text-ink-faint">
            {plan.doneItems}/{plan.totalItems} items · {daysLeft} days left
          </p>
        </div>
      </div>
    </div>
  );

  /**
   * `scope` namespaces the sliding indicator's `layoutId`.
   *
   * The drawer and the desktop rail are both mounted at once — the rail is
   * only hidden with CSS — so a single shared id would leave Motion with two
   * claimants for the same element, and the indicator would vanish from one
   * of them. One id per rail.
   */
  /**
   * `collapsed` is passed rather than read from `mini`, because the drawer
   * renders the same list and must never collapse — it is a full-width panel
   * on a phone, where an icon-only rail would be pointless.
   */
  const navList = (scope: 'rail' | 'drawer', collapsed = false) => (
    <nav
      aria-label="Plan sections"
      className={cn('mt-4 flex-1 overflow-y-auto pb-2', collapsed ? 'px-2' : 'px-2')}
    >
      {!collapsed && (
        <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
          Navigation
        </p>
      )}
      <ul className="space-y-0.5">
        {NAV.map(({ slug, label, icon: Icon, hint }) => {
          const href = `/plan/${plan.id}/${slug}`;
          const active = pathname === href;

          const link = (
            <Link
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex min-h-touch items-center rounded-xl text-sm font-medium',
                'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60',
                collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5',
                active ? 'text-accent' : 'text-ink-muted hover:bg-glass/[0.07] hover:text-ink',
              )}
            >
              {/* One indicator that slides between sections, rather than a
                  background that pops on and off. It carries a left edge and
                  a bloom, so the active section is legible from the shape as
                  well as from the colour. */}
              {active && (
                <motion.span
                  layoutId={`plan-nav-active-${scope}`}
                  className="absolute inset-0 rounded-xl bg-accent/[0.14] shadow-[inset_2px_0_0_0_rgb(var(--accent-vivid)),0_4px_18px_-8px_rgb(var(--accent)/0.6)] ring-1 ring-inset ring-accent/20"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              )}
              <Icon className="relative z-10 h-4.5 w-4.5 shrink-0" strokeWidth={active ? 2.4 : 2} />
              {!collapsed && <span className="relative z-10">{label}</span>}
              {/* The label still has to reach a screen reader when it is not
                  painted, or the collapsed rail is six unlabelled icons. */}
              {collapsed && <span className="sr-only">{label}</span>}
            </Link>
          );

          return (
            <li key={slug}>
              {collapsed ? (
                <Hint label={`${label} — ${hint}`} side="right">
                  {link}
                </Hint>
              ) : (
                link
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const streakCard = (
    <div className="px-3 pb-4 pb-safe pt-2">
      <div
        className={cn(
          'glass flex items-center gap-2.5 rounded-card px-3.5 py-2.5',
          // A live streak is worth protecting, so it gets the bloom. At zero it
          // is deliberately inert: glowing at someone who has not started is
          // the wrong kind of encouragement.
          streak > 0 && 'shadow-glow',
        )}
      >
        <Flame
          className={cn('h-4.5 w-4.5 shrink-0', streak > 0 ? 'text-accent-vivid' : 'text-ink-faint')}
          fill={streak > 0 ? 'currentColor' : 'none'}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-semibold leading-none">
            {streak} day{streak === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-2xs text-ink-faint">current study streak</p>
        </div>
      </div>
    </div>
  );

  /**
   * The collapse control.
   *
   * Deliberately at the *bottom* of the rail rather than in the header. The
   * header is where navigation lives, and a control that changes the chrome
   * rather than the destination does not belong among the things that take you
   * somewhere. It is also the least likely place to be hit by accident.
   */
  const railToggle = (
    <Hint label={mini ? 'Expand sidebar' : 'Collapse sidebar'} side="right">
      <button
        type="button"
        onClick={toggleRail}
        aria-label={mini ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-pressed={mini}
        className={cn(
          'flex min-h-touch items-center rounded-xl text-xs font-medium text-ink-faint',
          'outline-none transition-colors hover:bg-glass/[0.08] hover:text-ink',
          'focus-visible:ring-2 focus-visible:ring-accent/60',
          mini ? 'h-9 w-9 min-h-0 justify-center' : 'w-full gap-2.5 px-3 py-2.5',
        )}
      >
        {mini ? (
          <PanelLeftOpen className="h-4.5 w-4.5" />
        ) : (
          <>
            <PanelLeftClose className="h-4.5 w-4.5 shrink-0" />
            Collapse
          </>
        )}
      </button>
    </Hint>
  );

  return (
    <>
      {/* ------------------------------------------------------ mobile bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-glass-edge/[0.07] bg-bg/80 px-2 pt-safe backdrop-blur-2xl md:hidden">
        <div className="holo-rule absolute inset-x-0 bottom-0 opacity-70" />
        <button
          onClick={() => setOpen(true)}
          aria-label="Open plan navigation"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field text-ink-muted outline-none transition-colors hover:bg-glass/[0.08] focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-glass/[0.12]"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 px-1 text-center">
          <p className="truncate font-display text-xs font-semibold leading-tight text-ink">
            {plan.title}
          </p>
          <p className="text-2xs font-medium text-accent">{currentSection?.label ?? 'Workspace'}</p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          <UserMenu {...user} />
        </div>
      </header>

      {/* -------------------------------------------------- mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="md:hidden" showClose={false}>
          <SheetHeader className="pr-4">
            <SheetClose asChild>
              <Link
                href="/app"
                className="inline-flex min-h-touch items-center gap-1.5 rounded-lg px-1 text-xs font-medium text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <ChevronLeft className="h-4 w-4" />
                All plans
              </Link>
            </SheetClose>
            <SheetTitle className="sr-only">Plan navigation</SheetTitle>
          </SheetHeader>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {planHead}
            {navList('drawer')}
            {streakCard}
          </div>
        </SheetContent>
      </Sheet>

      {/* -------------------------------------------------- mobile tab bar */}
      <nav
        aria-label="Plan sections"
        className="fixed inset-x-0 bottom-0 z-40 flex h-tabbar items-stretch border-t border-glass-edge/[0.08] bg-bg/85 pb-safe backdrop-blur-2xl md:hidden"
      >
        {/* An iridescent hairline along the top edge of the bar. On a phone
            this is the only chrome always in view, so it is worth the detail. */}
        <div aria-hidden className="holo-rule absolute inset-x-0 top-0" />
        {TAB_BAR.map(({ slug, label, icon: Icon }) => {
          const href = `/plan/${plan.id}/${slug}`;
          const active = pathname === href;

          return (
            <Link
              key={slug}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'relative flex flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium',
                'touch-manipulation outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60',
                active ? 'text-accent' : 'text-ink-faint active:text-ink',
              )}
            >
              {/* A short bar at the top edge of the active tab. On a phone the
                  colour change alone is easy to miss mid-scroll. */}
              {active && (
                <motion.span
                  layoutId="plan-tab-active"
                  className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-gradient-to-r from-accent-vivid to-cyan-vivid shadow-[0_0_12px_1px_rgb(var(--accent)/0.7)]"
                  transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                />
              )}
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.9} />
              <span>{label}</span>
            </Link>
          );
        })}

        <button
          onClick={() => setOpen(true)}
          aria-label="More sections"
          aria-expanded={open}
          className={cn(
            'relative flex flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium',
            'touch-manipulation outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60',
            isMoreActive ? 'text-accent' : 'text-ink-faint active:text-ink',
          )}
        >
          {isMoreActive && (
            <span className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-gradient-to-r from-accent-vivid to-cyan-vivid shadow-[0_0_12px_1px_rgb(var(--accent)/0.7)]" />
          )}
          <MoreHorizontal className="h-5 w-5" strokeWidth={isMoreActive ? 2.5 : 1.9} />
          <span className="max-w-full truncate px-1">
            {isMoreActive ? currentSection?.label : 'More'}
          </span>
        </button>
      </nav>

      {/* ----------------------------------------------------- desktop rail */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-glass-edge/[0.07]',
          'bg-bg/60 backdrop-blur-2xl md:flex',
          // Driven by the same variable the content column is padded by, so the
          // rail and the page can never disagree about how wide it is.
          'w-[var(--rail-w)] transition-[width] duration-300 ease-out',
        )}
      >
        {/* A vertical iridescent edge, mirroring the horizontal one under the
            top bars. It is what ties the rail into the same material. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-accent/25 to-transparent"
        />

        <div
          className={cn(
            'flex h-16 items-center gap-1 border-b border-glass-edge/[0.06]',
            mini ? 'justify-center px-2' : 'justify-between px-3',
          )}
        >
          <Link
            href="/app"
            aria-label="Your plans"
            className="flex items-center rounded-xl px-1 outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <KairoLogo size="sm" id="rail" showWord={!mini} />
          </Link>
          {!mini && (
            <div className="flex items-center gap-0.5">
              <ThemeToggle />
              <UserMenu {...user} />
            </div>
          )}
        </div>

        {mini ? (
          /*
            Collapsed, the rail keeps exactly what is still legible at 68px: the
            mark, the six section icons, and the account controls. Everything
            that depends on reading text — the plan title, the progress bar, the
            streak — is dropped rather than truncated, because a clipped plan
            title tells you less than no plan title.
          */
          <div className="flex flex-col items-center gap-1 pt-3">
            <Hint label="Back to all your plans" side="right">
              <Link
                href="/app"
                aria-label="All plans"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-faint outline-none transition-colors hover:bg-glass/[0.08] hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            </Hint>
          </div>
        ) : (
          <div className="px-3 pt-3">
            <Hint label="Back to all your plans" side="right">
              <Link
                href="/app"
                className="inline-flex min-h-touch items-center gap-1.5 rounded-lg px-2 text-xs text-ink-faint outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                All plans
              </Link>
            </Hint>
          </div>
        )}

        {!mini && planHead}
        {navList('rail', mini)}

        {mini ? (
          <div className="flex flex-col items-center gap-1 pb-4 pb-safe pt-2">
            <Hint label={`${streak} day study streak`} side="right">
              <span
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  streak > 0 ? 'text-accent-vivid' : 'text-ink-faint',
                )}
                role="img"
                aria-label={`${streak} day study streak`}
              >
                <Flame
                  className="h-4.5 w-4.5"
                  fill={streak > 0 ? 'currentColor' : 'none'}
                  aria-hidden
                />
              </span>
            </Hint>
            <ThemeToggle />
            <UserMenu {...user} />
            {railToggle}
          </div>
        ) : (
          <>
            {streakCard}
            <div className="px-3 pb-4 pb-safe">{railToggle}</div>
          </>
        )}
      </aside>
    </>
  );
}
