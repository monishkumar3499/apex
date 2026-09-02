'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays, Layers, Library, Brain, MessageSquare, LineChart,
  ChevronLeft, Flame, Menu, X, Compass,
} from 'lucide-react';
import { cn, pct } from '../lib/utils';
import { Progress } from './ui';
import { ThemeToggle } from './theme';
import { UserMenu } from './user-menu';

const NAV = [
  { slug: 'today', label: 'Today', icon: CalendarDays },
  { slug: 'map', label: 'Map', icon: Layers },
  { slug: 'library', label: 'Library', icon: Library },
  { slug: 'drill', label: 'Drill', icon: Brain },
  { slug: 'coach', label: 'Coach', icon: MessageSquare },
  { slug: 'progress', label: 'Progress', icon: LineChart },
];

/**
 * The four destinations that get used daily.
 *
 * A six-item tab bar on a 360px screen gives each tab 60px, which is too
 * narrow for a label and reads as a toolbar rather than navigation. Library
 * and Progress are reference surfaces, not daily ones, so they stay in the
 * drawer and the bar keeps comfortable targets.
 */
const TAB_BAR = ['today', 'map', 'drill', 'coach'];

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

  // A drawer that leaves the page scrollable behind it is the single most
  // common mobile-nav bug: the backdrop moves under your finger.
  React.useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const progress = pct(plan.doneItems, plan.totalItems);
  const pace = PACE[paceStatus] ?? PACE['on-track'];

  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(`${plan.targetDate}T00:00:00`).getTime() - Date.now()) / 86_400_000),
  );

  const nav = (
    <>
      {/* ------------------------------------------------------ plan head */}
      <div className="px-3 pt-4">
        <Link
          href="/app"
          className="mb-4 inline-flex min-h-touch items-center gap-1.5 px-2 text-xs text-ink-faint transition-colors hover:text-ink"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          All plans
        </Link>

        <div className="px-2">
          <h2 className="line-clamp-2 font-display text-sm font-semibold leading-snug">{plan.title}</h2>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="tabular font-display text-lg font-semibold">
              {progress}
              <span className="text-xs text-ink-faint">%</span>
            </span>
            <span className={cn('text-2xs font-semibold uppercase tracking-wider', pace.className)}>
              {pace.label}
            </span>
          </div>

          <Progress value={progress} className="mt-2" />

          <p className="tabular mt-2 text-2xs text-ink-faint">
            {plan.doneItems}/{plan.totalItems} items · {daysLeft} days left
          </p>
        </div>
      </div>

      <div className="mx-3 my-4 h-px bg-line" />

      {/* ----------------------------------------------------------- nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3">
        {NAV.map(({ slug, label, icon: Icon }) => {
          const href = `/plan/${plan.id}/${slug}`;
          const active = pathname === href;
          return (
            <Link
              key={slug}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-touch items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-accent/12 font-medium text-accent'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* --------------------------------------------------------- streak */}
      <div className="px-3 pb-4 pb-safe">
        <div className="mb-3 h-px bg-line" />
        <div className="flex items-center gap-2.5 rounded-lg bg-surface-2 px-3 py-2.5">
          <Flame
            className={cn('h-4 w-4', streak > 0 ? 'text-accent' : 'text-ink-faint')}
            fill={streak > 0 ? 'currentColor' : 'none'}
          />
          <div className="min-w-0 flex-1">
            <p className="tabular text-sm font-semibold leading-none">{streak}</p>
            <p className="mt-0.5 text-2xs text-ink-faint">day streak</p>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* ------------------------------------------------------ mobile bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-line bg-bg/90 px-2 pt-safe backdrop-blur-xl lg:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open plan navigation"
          aria-expanded={open}
          className="flex h-touch w-touch shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center font-display text-sm font-semibold">
          {plan.title}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <ThemeToggle />
          <UserMenu {...user} />
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in"
            onClick={() => setOpen(false)}
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(17rem,85vw)] flex-col border-r border-line bg-surface pt-safe animate-slide-in-left"
            role="dialog"
            aria-modal="true"
            aria-label="Plan navigation"
          >
            <button
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="absolute right-2 top-2 flex h-touch w-touch items-center justify-center rounded-lg text-ink-muted hover:bg-surface-2"
            >
              <X className="h-4 w-4" />
            </button>
            {nav}
          </aside>
        </div>
      )}

      {/* -------------------------------------------------- mobile tab bar */}
      {/*
        A drawer alone means every navigation on a phone costs two taps and a
        wait for an animation. The daily surfaces get thumb-reachable tabs;
        the drawer stays for everything else.
      */}
      <nav
        aria-label="Plan sections"
        className="fixed inset-x-0 bottom-0 z-40 flex h-tabbar items-stretch border-t border-line bg-bg/95 pb-safe backdrop-blur-xl lg:hidden"
      >
        {TAB_BAR.map((slug) => {
          const entry = NAV.find((n) => n.slug === slug)!;
          const href = `/plan/${plan.id}/${slug}`;
          const active = pathname === href;
          const Icon = entry.icon;

          return (
            <Link
              key={slug}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors',
                active ? 'text-accent' : 'text-ink-faint hover:text-ink-muted',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 2} />
              {entry.label}
            </Link>
          );
        })}
      </nav>

      {/* ----------------------------------------------------- desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-surface/60 backdrop-blur-sm lg:flex">
        <div className="flex h-14 items-center justify-between border-b border-line px-4">
          <Link href="/app" className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-accent-fg">
              <Compass className="h-3.5 w-3.5" strokeWidth={2.5} />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">APEX</span>
          </Link>
          <div className="flex items-center gap-0.5">
            <ThemeToggle />
            <UserMenu {...user} />
          </div>
        </div>
        {nav}
      </aside>
    </>
  );
}
