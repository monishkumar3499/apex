'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'motion/react';
import {
  CalendarDays, Layers, Library, Brain, MessageSquare, LineChart,
  ChevronLeft, Flame, Menu, Compass, MoreHorizontal,
} from 'lucide-react';
import { cn, pct } from '../lib/utils';
import { Progress, Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose, Hint } from './ui';
import { ThemeToggle } from './theme';
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
  ahead: { label: 'Ahead', className: 'text-success' },
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
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <h2 className="line-clamp-2 font-display text-sm font-semibold leading-snug tracking-tight">
          {plan.title}
        </h2>

        <div className="mt-2.5 flex items-baseline justify-between gap-2">
          <span className="tabular font-display text-base font-semibold">
            {progress}
            <span className="text-xs text-ink-faint">%</span>
          </span>
          <span className={cn('text-2xs font-semibold uppercase tracking-wider', pace.className)}>
            {pace.label}
          </span>
        </div>

        <Progress value={progress} className="mt-2" label={`Plan progress: ${progress}%`} />

        <p className="tabular mt-2 text-2xs text-ink-faint">
          {plan.doneItems}/{plan.totalItems} items · {daysLeft} days left
        </p>
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
  const navList = (scope: 'rail' | 'drawer') => (
    <nav aria-label="Plan sections" className="mt-4 flex-1 overflow-y-auto px-2 pb-2">
      <p className="px-3 pb-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
        Navigation
      </p>
      <ul className="space-y-0.5">
        {NAV.map(({ slug, label, icon: Icon }) => {
          const href = `/plan/${plan.id}/${slug}`;
          const active = pathname === href;

          return (
            <li key={slug}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex min-h-touch items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium',
                  'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/60',
                  active ? 'text-accent' : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
                )}
              >
                {/* One indicator that slides between sections, rather than a
                    background that pops on and off. */}
                {active && (
                  <motion.span
                    layoutId={`plan-nav-active-${scope}`}
                    className="absolute inset-0 rounded-xl bg-accent/12"
                    transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                  />
                )}
                <Icon className="relative z-10 h-4.5 w-4.5 shrink-0" strokeWidth={active ? 2.4 : 2} />
                <span className="relative z-10">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const streakCard = (
    <div className="px-3 pb-4 pb-safe pt-2">
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
        <Flame
          className={cn('h-4.5 w-4.5 shrink-0', streak > 0 ? 'text-accent' : 'text-ink-faint')}
          fill={streak > 0 ? 'currentColor' : 'none'}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="tabular text-sm font-semibold leading-none">
            {streak} day{streak === 1 ? '' : 's'}
          </p>
          <p className="mt-1 text-2xs text-ink-faint">current study streak</p>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ------------------------------------------------------ mobile bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-line bg-bg/95 px-2 pt-safe backdrop-blur-xl md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open plan navigation"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-field text-ink-muted outline-none transition-colors hover:bg-surface-2 focus-visible:ring-2 focus-visible:ring-accent/60 active:bg-surface-3"
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
        className="fixed inset-x-0 bottom-0 z-40 flex h-tabbar items-stretch border-t border-line bg-bg/95 pb-safe backdrop-blur-xl md:hidden"
      >
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
                  className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-accent"
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
            <span className="absolute inset-x-5 top-0 h-0.5 rounded-b-full bg-accent" />
          )}
          <MoreHorizontal className="h-5 w-5" strokeWidth={isMoreActive ? 2.5 : 1.9} />
          <span className="max-w-full truncate px-1">
            {isMoreActive ? currentSection?.label : 'More'}
          </span>
        </button>
      </nav>

      {/* ----------------------------------------------------- desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-surface/60 backdrop-blur-sm md:flex 3xl:w-sidebar-lg">
        <div className="flex h-14 items-center justify-between gap-1 border-b border-line px-3">
          <Link
            href="/app"
            className="flex items-center gap-2 rounded-lg px-1 outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-fg">
              <Compass className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
            <span className="font-display text-sm font-semibold tracking-tight">APEX</span>
          </Link>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <UserMenu {...user} />
          </div>
        </div>

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

        {planHead}
        {navList('rail')}
        {streakCard}
      </aside>
    </>
  );
}
