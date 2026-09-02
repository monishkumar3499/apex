'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Check, Clock, PartyPopper, CalendarOff, AlertTriangle, RefreshCw,
  ChevronDown, Brain, ArrowRight, Sparkles, Target, CalendarDays,
  BookOpen, Layers, PenLine, RotateCcw, Coffee, Hammer, Flag,
} from 'lucide-react';
import { Badge, Dial, Button, EmptyState } from './ui';
import { ResourcePanel, type Resource } from './resource-panel';
import { SessionTimer } from './session-timer';
import { cn, formatMinutes, formatDate, relativeDay, pct, ITEM_META, TONE_CLASSES, type ItemKind } from '../lib/utils';

export interface SessionItem {
  id: string;
  idx: number;
  kind: ItemKind;
  title: string;
  detail: string | null;
  est_minutes: number;
  status: 'pending' | 'done' | 'skipped';
  topics: { id: string; title: string; mastery: number } | null;
  resources: Resource | null;
}

interface OverdueItem {
  id: string;
  title: string;
  kind: string;
  estMinutes: number;
  scheduledOn: string;
}

export function TodayBoard({
  planId, dayIndex, totalDays, scheduledOn, isToday, headline,
  plannedMinutes, items, overdue, daysLeft,
}: {
  planId: string;
  dayIndex: number;
  totalDays: number;
  scheduledOn: string;
  isToday: boolean;
  headline: string | null;
  plannedMinutes: number;
  items: SessionItem[];
  overdue: OverdueItem[];
  daysLeft: number;
}) {
  const router = useRouter();
  const [local, setLocal] = React.useState(items);
  const [pendingIds, setPendingIds] = React.useState<Set<string>>(new Set());
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const [replanning, setReplanning] = React.useState(false);

  React.useEffect(() => { setLocal(items); }, [items]);

  // Open the first unfinished item so the session starts with one click.
  React.useEffect(() => {
    if (expanded === null) {
      const next = items.find((i) => i.status === 'pending');
      if (next) setExpanded(next.id);
    }
    // Intentionally only on first item load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const done = local.filter((i) => i.status === 'done');
  const doneMinutes = done.reduce((s, i) => s + i.est_minutes, 0);
  const progress = pct(done.length, local.length);
  const allDone = local.length > 0 && done.length === local.length;

  const toggle = async (item: SessionItem) => {
    const next = item.status === 'done' ? 'pending' : 'done';

    // Optimistic update
    setLocal((current) => current.map((i) => (i.id === item.id ? { ...i, status: next } : i)));
    setPendingIds((s) => new Set(s).add(item.id));

    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? 'Could not update that item');

      if (next === 'done') {
        const remaining = local.filter((i) => i.id !== item.id && i.status !== 'done').length;
        if (remaining === 0) toast.success("That's today done. Well held.", { icon: '🎯' });
        // Advance to the next unfinished item
        const following = local.find((i) => i.id !== item.id && i.status === 'pending');
        setExpanded(following?.id ?? null);
      }
      router.refresh();
    } catch (error) {
      setLocal((current) => current.map((i) => (i.id === item.id ? { ...i, status: item.status } : i)));
      toast.error((error as Error).message);
    } finally {
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(item.id);
        return next;
      });
    }
  };

  const replan = async () => {
    setReplanning(true);
    try {
      const response = await fetch(`/api/plans/${planId}/replan`, { method: 'POST' });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? 'Could not reschedule');
      toast.success(`Moved ${body.data.moved} items into the days you have left.`);
      router.refresh();
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setReplanning(false);
    }
  };

  return (
    <div className="animate-in space-y-6">
      {/* --------------------------------------------------------- header hero card */}
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br from-surface via-surface to-surface-2 p-5 shadow-sm sm:p-6 md:p-7">
        {/* Subtle ambient lighting */}
        <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full bg-accent/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-8 -bottom-8 h-40 w-40 rounded-full bg-info/5 blur-3xl" />

        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            {/* Context chips */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-line/70 bg-surface-2/90 px-2.5 py-1 text-xs font-medium text-ink-muted shadow-xs">
                <CalendarDays className="h-3.5 w-3.5 text-accent" />
                {formatDate(scheduledOn, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>

              {dayIndex > 0 && (
                <span className="inline-flex items-center rounded-lg border border-line/70 bg-surface-2/90 px-2.5 py-1 text-xs font-medium text-ink-muted tabular shadow-xs">
                  Day {dayIndex} of {totalDays}
                </span>
              )}

              {daysLeft > 0 && (
                <span className="inline-flex items-center gap-1 rounded-lg border border-line/70 bg-surface-2/90 px-2.5 py-1 text-xs font-medium text-ink-muted tabular shadow-xs">
                  <Target className="h-3.5 w-3.5 text-info" />
                  {daysLeft} days to target
                </span>
              )}

              {!isToday && <Badge tone="muted">Rest day today</Badge>}
            </div>

            {/* Title */}
            <h1 className="mt-3.5 font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {isToday ? "Today's Agenda" : relativeDay(scheduledOn)}
            </h1>

            {/* Focus topic pill */}
            {headline && (
              <div className="mt-3 flex items-center">
                <div className="inline-flex items-center gap-2 rounded-xl border border-accent/30 bg-accent/[0.08] px-3.5 py-1.5 text-xs font-medium text-accent backdrop-blur-sm sm:text-sm">
                  <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                  <span className="text-ink-muted">Focus Topic:</span>
                  <span className="font-semibold text-ink">{headline}</span>
                </div>
              </div>
            )}
          </div>

          {/* Right side stats cockpit */}
          {local.length > 0 && (
            <div className="flex shrink-0 items-center justify-between gap-4 rounded-xl border border-line/80 bg-surface-2/80 p-3.5 shadow-xs backdrop-blur-sm sm:justify-start sm:p-4">
              <div className="sm:text-right">
                <p className="tabular font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
                  {formatMinutes(doneMinutes)}
                  <span className="text-xs font-normal text-ink-muted sm:text-sm"> / {formatMinutes(plannedMinutes)}</span>
                </p>
                <p className="mt-0.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                  {done.length} of {local.length} completed
                </p>
              </div>
              <div className="relative shrink-0">
                <Dial value={progress} size={48} stroke={4.5} tone={allDone ? 'success' : 'accent'} />
              </div>
            </div>
          )}
        </div>

        {/* Progress bar inside the hero card */}
        {local.length > 0 && (
          <div className="relative mt-5 border-t border-line/50 pt-3">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="font-medium text-ink-muted">Daily Completion</span>
              <span className="tabular font-semibold text-accent">{progress}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500 ease-out',
                  allDone
                    ? 'bg-gradient-to-r from-success to-emerald-400'
                    : 'bg-gradient-to-r from-accent to-accent-hover',
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* -------------------------------------------------------- overdue */}
      {overdue.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-warn/30 bg-gradient-to-r from-warn/[0.08] via-surface to-surface-2 p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warn/15 text-warn">
                <AlertTriangle className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-ink">
                  {overdue.length} item{overdue.length === 1 ? '' : 's'} to catch up on
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted sm:text-sm">
                  Roughly {formatMinutes(overdue.reduce((s, o) => s + o.estMinutes, 0))} of unfinished work
                  from {relativeDay(overdue[overdue.length - 1].scheduledOn).toLowerCase()}.
                  APEX can automatically balance it across your remaining days.
                </p>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={replan}
              loading={replanning}
              className="self-start shrink-0 rounded-xl sm:self-auto"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Auto-reschedule
            </Button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- items list */}
      <div>
        <div className="mb-3.5 flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold text-ink sm:text-lg">
              Tasks for Today
            </h2>
            <span className="rounded-full bg-surface-3 px-2 py-0.5 text-2xs font-semibold text-ink-muted">
              {local.length}
            </span>
          </div>
          <span className="hidden text-2xs text-ink-faint sm:inline-block">
            Click an item to view study materials and session timer
          </span>
        </div>

        {local.length === 0 ? (
          <EmptyState
            icon={<CalendarOff className="h-6 w-6 text-ink-faint" />}
            title={isToday ? 'Nothing scheduled today' : 'No upcoming session'}
            description={
              isToday
                ? 'This is a scheduled rest day. Rest is part of the plan — or get ahead with a drill session.'
                : 'Your plan has no further sessions scheduled.'
            }
            action={
              <Link href={`/plan/${planId}/drill`}>
                <Button variant="secondary" className="rounded-xl">
                  <Brain className="h-4 w-4" />
                  Drill instead
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-3">
            {local.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                planId={planId}
                expanded={expanded === item.id}
                busy={pendingIds.has(item.id)}
                onToggle={() => toggle(item)}
                onExpand={() => setExpanded((current) => (current === item.id ? null : item.id))}
              />
            ))}
          </ul>
        )}
      </div>

      {allDone && (
        <div className="overflow-hidden rounded-2xl border border-success/30 bg-gradient-to-b from-success/[0.08] to-surface p-6 text-center shadow-sm animate-in sm:p-8">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15 text-success">
            <PartyPopper className="h-6 w-6" />
          </div>
          <h3 className="mt-3.5 font-display text-xl font-bold text-ink">Today is complete!</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
            {formatMinutes(doneMinutes)} logged. Fantastic focus. Come back tomorrow, or lock it in with a drill
            session while it is still fresh in memory.
          </p>
          <div className="mt-5 flex justify-center">
            <Link href={`/plan/${planId}/drill`}>
              <Button variant="secondary" className="rounded-xl">
                <Brain className="h-4 w-4 text-accent" />
                Drill what you learned
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- row */

function ItemRow({
  item, planId, expanded, busy, onToggle, onExpand,
}: {
  item: SessionItem;
  planId: string;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const meta = ITEM_META[item.kind] ?? ITEM_META.learn;
  const isDone = item.status === 'done';

  const KindIcon = {
    learn: BookOpen,
    practice: PenLine,
    review: RotateCcw,
    project: Hammer,
    assess: Flag,
    mock: Target,
    buffer: Coffee,
  }[item.kind] ?? BookOpen;

  return (
    <li>
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl border transition-all duration-200 shadow-sm',
          isDone
            ? 'border-line/60 bg-surface/50 opacity-75'
            : expanded
              ? 'border-accent/40 bg-gradient-to-b from-surface via-surface to-surface-2/60 ring-1 ring-accent/15 shadow-md shadow-accent/5'
              : 'border-line bg-surface hover:border-line-strong hover:bg-surface-2/40 hover:shadow-md',
        )}
      >
        {/* Subtle left border tone indicator */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 w-1 transition-colors',
            isDone ? 'bg-success' : expanded ? 'bg-accent' : 'bg-transparent group-hover:bg-line-strong',
          )}
        />

        {/* Card Header (Main Row) */}
        <div className="flex items-start gap-3.5 p-4 pl-4.5 sm:p-5 sm:pl-5">
          {/* Custom Interactive Checkbox */}
          <button
            onClick={onToggle}
            disabled={busy}
            aria-label={isDone ? `Mark "${item.title}" as not done` : `Mark "${item.title}" as done`}
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border transition-all duration-150 active:scale-95',
              isDone
                ? 'border-success bg-success text-white shadow-xs shadow-success/20'
                : 'border-line-strong bg-surface-2/80 hover:border-accent hover:bg-accent/10 hover:shadow-xs',
              busy && 'pointer-events-none opacity-50',
            )}
          >
            {isDone ? (
              <Check className="h-3.5 w-3.5" strokeWidth={3} />
            ) : (
              <Check className="h-3.5 w-3.5 text-accent opacity-0 transition-opacity group-hover:opacity-60" strokeWidth={2.5} />
            )}
          </button>

          {/* Title & Metadata (Click to expand) */}
          <button onClick={onExpand} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider',
                  TONE_CLASSES[meta.tone],
                )}
              >
                <KindIcon className="h-3 w-3" />
                {meta.label}
              </span>

              <span className="tabular flex items-center gap-1 rounded-md border border-line/60 bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted">
                <Clock className="h-3 w-3 text-ink-faint" />
                {formatMinutes(item.est_minutes)}
              </span>

              {item.topics && (
                <span className="tabular hidden items-center gap-1 rounded-md border border-line/60 bg-surface-2 px-2 py-0.5 text-2xs font-medium text-ink-muted sm:inline-flex">
                  <Layers className="h-3 w-3 text-ink-faint" />
                  {item.topics.title}
                  {item.topics.mastery > 0 && ` · ${item.topics.mastery}%`}
                </span>
              )}
            </div>

            <p
              className={cn(
                'mt-2 font-display text-base font-semibold leading-snug transition-colors',
                isDone ? 'text-ink-muted line-through' : 'text-ink group-hover:text-accent-hover',
              )}
            >
              {item.title}
            </p>
          </button>

          {/* Expand/Collapse Chevron Button */}
          <button
            onClick={onExpand}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-all hover:bg-surface-3 hover:text-ink"
          >
            <ChevronDown className={cn('h-4.5 w-4.5 transition-transform duration-200', expanded && 'rotate-180 text-accent')} />
          </button>
        </div>

        {/* Expanded Panel */}
        {expanded && (
          <div className="border-t border-line/70 bg-surface-2/40 px-4.5 pb-5 pt-4 animate-in sm:px-5 sm:pb-6">
            {item.detail && (
              <div className="rounded-xl border-l-2 border-accent/50 bg-surface p-3.5 text-sm leading-relaxed text-ink-muted shadow-xs">
                {item.detail}
              </div>
            )}

            {item.resources && (
              <div className="mt-4">
                <ResourcePanel resource={item.resources} />
              </div>
            )}

            {/* Bottom Action Bar */}
            <div className="mt-5 flex flex-col gap-3 border-t border-line/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2.5">
                <SessionTimer minutes={item.est_minutes} onComplete={!isDone ? onToggle : undefined} />

                {item.topics && (
                  <Link href={`/plan/${planId}/drill?topic=${item.topics.id}`}>
                    <Button variant="secondary" size="sm" className="h-9 rounded-xl">
                      <Brain className="h-3.5 w-3.5 text-accent" />
                      Drill topic
                    </Button>
                  </Link>
                )}
              </div>

              {!isDone ? (
                <Button
                  size="sm"
                  onClick={onToggle}
                  loading={busy}
                  className="h-9 w-full rounded-xl shadow-sm sm:w-auto"
                >
                  <Check className="h-4 w-4" />
                  Mark completed
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onToggle}
                  loading={busy}
                  className="h-9 w-full rounded-xl text-ink-muted hover:text-ink sm:w-auto"
                >
                  Mark as uncompleted
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </li>
  );
}
