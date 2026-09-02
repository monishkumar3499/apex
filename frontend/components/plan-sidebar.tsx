'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays, Layers, Library, Brain, MessageSquare, LineChart,
  ChevronLeft, Flame, Menu, X, Compass, MoreHorizontal,
} from 'lucide-react';
import { cn, pct } from '../lib/utils';
import { Progress } from './ui';
import { ThemeToggle } from './theme';
import { UserMenu } from './user-menu';

const NAV = [
  { slug: 'today', label: 'Today', icon: CalendarDays },
  { slug: 'map', label: 'Map', icon: Layers },
  { slug: 'drill', label: 'Drill', icon: Brain },
  { slug: 'coach', label: 'Coach', icon: MessageSquare },
  { slug: 'library', label: 'Library', icon: Library },
  { slug: 'progress', label: 'Progress', icon: LineChart },
];

const TAB_BAR = [
  { slug: 'today', label: 'Today', icon: CalendarDays },
  { slug: 'map', label: 'Map', icon: Layers },
  { slug: 'drill', label: 'Drill', icon: Brain },
  { slug: 'coach', label: 'Coach', icon: MessageSquare },
];

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

  const currentSection = NAV.find((n) => pathname?.endsWith(`/${n.slug}`));
  const isMoreActive = pathname?.endsWith('/library') || pathname?.endsWith('/progress');

  const navContent = (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* ------------------------------------------------------ plan head */}
      <div className="px-4 pt-3">
        <div className="rounded-xl border border-line bg-surface-2 p-3">
          <h2 className="line-clamp-2 font-display text-sm font-semibold leading-snug">{plan.title}</h2>

          <div className="mt-2.5 flex items-baseline justify-between">
            <span className="tabular font-display text-base font-semibold">
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

      {/* ----------------------------------------------------------- nav */}
      <div className="mt-3 px-2">
        <p className="px-2 text-2xs font-semibold uppercase tracking-wider text-ink-faint">Navigation</p>
      </div>
      <nav className="mt-1 flex-1 space-y-1 overflow-y-auto px-2">
        {NAV.map(({ slug, label, icon: Icon }) => {
          const href = `/plan/${plan.id}/${slug}`;
          const active = pathname === href;
          return (
            <Link
              key={slug}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-touch items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-accent/12 text-accent'
                  : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
              )}
            >
              <Icon className="h-4.5 w-4.5 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* --------------------------------------------------------- streak */}
      <div className="px-3 pb-4 pb-safe pt-2">
        <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface-2 px-3.5 py-2.5">
          <Flame
            className={cn('h-4.5 w-4.5 shrink-0', streak > 0 ? 'text-accent' : 'text-ink-faint')}
            fill={streak > 0 ? 'currentColor' : 'none'}
          />
          <div className="min-w-0 flex-1">
            <p className="tabular text-sm font-semibold leading-none">{streak} days</p>
            <p className="mt-0.5 text-2xs text-ink-faint">current study streak</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* ------------------------------------------------------ mobile bar */}
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-line bg-bg/95 px-2.5 pt-safe backdrop-blur-xl md:hidden">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open plan navigation"
          aria-expanded={open}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-2 active:bg-surface-3"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1 px-1.5 text-center">
          <p className="truncate font-display text-xs font-semibold leading-tight text-ink">
            {plan.title}
          </p>
          <p className="text-2xs font-medium text-accent">
            {currentSection?.label ?? 'Workspace'}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle />
          <UserMenu {...user} />
        </div>
      </header>

      {/* -------------------------------------------------- mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <aside
            className="absolute inset-y-0 left-0 flex w-[min(19rem,88vw)] flex-col border-r border-line bg-surface pt-safe shadow-2xl animate-slide-in-left"
            role="dialog"
            aria-modal="true"
            aria-label="Plan navigation"
          >
            <div className="flex h-14 items-center justify-between border-b border-line px-3">
              <Link
                href="/app"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <ChevronLeft className="h-4 w-4" />
                All plans
              </Link>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="flex h-9 w-9 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {navContent}
          </aside>
        </div>
      )}

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
                'flex flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors touch-manipulation',
                active ? 'text-accent' : 'text-ink-faint hover:text-ink-muted active:text-ink',
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 1.9} />
              <span>{label}</span>
            </Link>
          );
        })}

        {/* 5th Tab: More / Drawer Toggle */}
        <button
          onClick={() => setOpen(true)}
          aria-label="More sections"
          aria-expanded={open}
          className={cn(
            'flex flex-1 flex-col items-center justify-center gap-1 text-2xs font-medium transition-colors touch-manipulation',
            isMoreActive ? 'text-accent font-semibold' : 'text-ink-faint hover:text-ink-muted active:text-ink',
          )}
        >
          <MoreHorizontal className="h-5 w-5" strokeWidth={isMoreActive ? 2.5 : 1.9} />
          <span>{isMoreActive ? (currentSection?.label ?? 'More') : 'More'}</span>
        </button>
      </nav>

      {/* ----------------------------------------------------- desktop rail */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-line bg-surface/60 backdrop-blur-sm md:flex">
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

        <div className="px-3 pt-3">
          <Link
            href="/app"
            className="mb-2 inline-flex min-h-touch items-center gap-1.5 px-2 text-xs text-ink-faint transition-colors hover:text-ink"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            All plans
          </Link>
        </div>

        {navContent}
      </aside>
    </>
  );
}
