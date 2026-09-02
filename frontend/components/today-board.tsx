'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  Check, Clock, PartyPopper, CalendarOff, AlertTriangle, RefreshCw,
  ChevronDown, Brain, ArrowRight,
} from 'lucide-react';
import { Card, Badge, Progress, Dial, Button, EmptyState } from './ui';
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

    // Optimistic — a checkbox that waits on the network feels broken.
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
        // Advance to the next unfinished item.
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
    <div className="animate-in">
      {/* --------------------------------------------------------- header */}
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="font-display text-fluid-h2 font-semibold">
              {isToday ? 'Today' : relativeDay(scheduledOn)}
            </h1>
            {!isToday && <Badge tone="muted">Rest day today</Badge>}
          </div>

          <p className="tabular mt-1.5 text-sm text-ink-muted">
            {formatDate(scheduledOn, { weekday: 'long' })}
            {dayIndex > 0 && ` · Day ${dayIndex} of ${totalDays}`}
            {daysLeft > 0 && ` · ${daysLeft} days to target`}
          </p>

          {headline && (
            <p className="mt-3 font-display text-base font-medium text-accent">{headline}</p>
          )}
        </div>

        {local.length > 0 && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="tabular font-display text-lg font-semibold">
                {formatMinutes(doneMinutes)}
                <span className="text-sm font-normal text-ink-faint"> / {formatMinutes(plannedMinutes)}</span>
              </p>
              <p className="text-2xs uppercase tracking-wider text-ink-faint">
                {done.length} of {local.length} done
              </p>
            </div>
            <Dial value={progress} size={48} tone={allDone ? 'success' : 'accent'} />
          </div>
        )}
      </div>

      {local.length > 0 && <Progress value={progress} tone={allDone ? 'success' : 'accent'} className="mt-6" />}

      {/* -------------------------------------------------------- overdue */}
      {overdue.length > 0 && (
        <Card className="mt-6 border-warn/25 bg-warn/[0.06] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
              <div>
                <p className="text-sm font-medium">
                  {overdue.length} item{overdue.length === 1 ? '' : 's'} still outstanding
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                  Roughly {formatMinutes(overdue.reduce((s, o) => s + o.estMinutes, 0))} of work,
                  oldest from {relativeDay(overdue[overdue.length - 1].scheduledOn).toLowerCase()}.
                  Reschedule and APEX will fit it into the days you have left.
                </p>
              </div>
            </div>
            <Button variant="secondary" size="sm" onClick={replan} loading={replanning}>
              <RefreshCw className="h-3.5 w-3.5" />
              Reschedule
            </Button>
          </div>
        </Card>
      )}

      {/* ---------------------------------------------------------- items */}
      <div className="mt-7">
        {local.length === 0 ? (
          <EmptyState
            icon={<CalendarOff className="h-5 w-5" />}
            title={isToday ? 'Nothing scheduled today' : 'No upcoming session'}
            description={
              isToday
                ? 'This is a scheduled rest day. Rest is part of the plan — or get ahead with a drill session.'
                : 'Your plan has no further sessions scheduled.'
            }
            action={
              <Link href={`/plan/${planId}/drill`}>
                <Button variant="secondary">
                  <Brain className="h-4 w-4" />
                  Drill instead
                </Button>
              </Link>
            }
          />
        ) : (
          <ul className="space-y-2.5">
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
        <Card className="mt-7 border-success/25 bg-success/[0.06] p-5 text-center animate-in sm:p-6">
          <PartyPopper className="mx-auto h-6 w-6 text-success" />
          <h3 className="mt-3 font-display text-lg font-semibold">Today is done</h3>
          <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">
            {formatMinutes(doneMinutes)} logged. Come back tomorrow, or lock it in with a drill
            session while it is still fresh.
          </p>
          <Link href={`/plan/${planId}/drill`} className="mt-5 inline-block">
            <Button variant="secondary">
              <Brain className="h-4 w-4" />
              Drill what you learned
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </Card>
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

  return (
    <li>
      <Card
        className={cn(
          'overflow-hidden transition-all duration-200',
          isDone && 'opacity-60',
          expanded && !isDone && 'border-accent/30',
        )}
      >
        <div className="flex items-start gap-3 p-3.5 sm:p-4">
          <button
            onClick={onToggle}
            disabled={busy}
            aria-label={isDone ? `Mark "${item.title}" as not done` : `Mark "${item.title}" as done`}
            className={cn(
              'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border transition-all sm:h-5 sm:w-5',
              isDone
                ? 'border-success bg-success text-white'
                : 'border-line-strong hover:border-accent hover:bg-accent/10',
              busy && 'opacity-50',
            )}
          >
            {isDone && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
          </button>

          <button onClick={onExpand} className="min-w-0 flex-1 text-left">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide',
                  TONE_CLASSES[meta.tone],
                )}
              >
                {meta.label}
              </span>
              <span className="tabular flex items-center gap-1 text-2xs text-ink-faint">
                <Clock className="h-3 w-3" />
                {formatMinutes(item.est_minutes)}
              </span>
              {item.topics && item.topics.mastery > 0 && (
                <span className="tabular text-2xs text-ink-faint">
                  mastery {item.topics.mastery}%
                </span>
              )}
            </div>

            <p className={cn('mt-1.5 text-sm font-medium leading-snug', isDone && 'line-through')}>
              {item.title}
            </p>
          </button>

          <button
            onClick={onExpand}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            className="-m-2 flex h-touch w-touch shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:text-ink"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', expanded && 'rotate-180')} />
          </button>
        </div>

        {expanded && (
          <div className="border-t border-line px-3.5 pb-4 pt-4 animate-in sm:px-4">
            {item.detail && (
              <p className="text-sm leading-relaxed text-ink-muted">{item.detail}</p>
            )}

            {item.resources && <ResourcePanel resource={item.resources} className="mt-4" />}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <SessionTimer minutes={item.est_minutes} onComplete={!isDone ? onToggle : undefined} />

              {item.topics && (
                <Link href={`/plan/${planId}/drill?topic=${item.topics.id}`}>
                  <Button variant="ghost" size="sm">
                    <Brain className="h-3.5 w-3.5" />
                    Drill this topic
                  </Button>
                </Link>
              )}

              {!isDone && (
                <Button size="sm" onClick={onToggle} loading={busy} className="ml-auto">
                  <Check className="h-3.5 w-3.5" />
                  Mark done
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </li>
  );
}
