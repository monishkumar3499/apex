'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check, Clock, PartyPopper, CalendarOff, AlertTriangle, RefreshCw,
  ChevronDown, Brain, ArrowRight, Sparkles, Target, CalendarDays,
  BookOpen, Layers, PenLine, RotateCcw, Coffee, Hammer, Flag,
} from 'lucide-react';
import {
  Badge, Dial, Button, EmptyState, Callout, OrbitRings, Progress, Spine, SpineNode,
  Collapsible, FadeIn, Hint, EASE,
} from './ui';
import { ResourcePanel, type Resource } from './resource-panel';
import { SessionTimer } from './session-timer';
import {
  cn, formatMinutes, formatDate, relativeDay, pct, ITEM_META, TONE_CLASSES, type ItemKind,
} from '../lib/utils';

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

const KIND_ICON: Record<ItemKind, typeof BookOpen> = {
  learn: BookOpen,
  practice: PenLine,
  review: RotateCcw,
  project: Hammer,
  assess: Flag,
  mock: Target,
  buffer: Coffee,
};

/**
 * The rail sits at the centre of a 44px touch target, so the visual node and
 * the tap area share a centre line. Kept here rather than inline because the
 * container and every node have to agree on it.
 */
const SPINE_X = '1.375rem';

export function TodayBoard({
  planId, dayIndex, totalDays, scheduledOn, isToday, headline,
  plannedMinutes, items, topicResources, overdue, daysLeft,
}: {
  planId: string;
  dayIndex: number;
  totalDays: number;
  scheduledOn: string;
  isToday: boolean;
  headline: string | null;
  plannedMinutes: number;
  items: SessionItem[];
  /**
   * Everything attached to each topic, keyed by topic id.
   *
   * The item's own `resources` is the one the scheduler pinned; this is the
   * rest of the shelf, so a topic whose primary resource is a doc still puts
   * its video in front of the learner instead of hiding it in the Library.
   */
  topicResources?: Record<string, Array<Resource | null>>;
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
    <div className="space-y-6">
      {/* ------------------------------------------------------------- header */}
      <FadeIn>
        <header className="glass focus-pane relative overflow-hidden rounded-panel p-5 shadow-e2 sm:p-6">
          {/* The day's own light. This header is the one panel on the screen
              that is always "live", so it is the one that gets the bloom. */}
          <div className="holo-rule absolute inset-x-0 top-0" />
          <div
            aria-hidden
            className="pointer-events-none absolute -right-16 -top-24 aspect-square w-64 opacity-40 sm:w-80"
          >
            <OrbitRings count={3} lit={1} />
          </div>

          {/*
            `items-center`, not `items-start`. The stat block is taller than the
            title block, so top-aligning the two left a band of dead space under
            the title on every screen wide enough to put them side by side.
          */}
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip icon={<CalendarDays className="text-accent" />}>
                  {formatDate(scheduledOn, { weekday: 'short', month: 'short', day: 'numeric' })}
                </Chip>

                {dayIndex > 0 && totalDays > 0 && (
                  <Chip>
                    Day <span className="font-mono">{dayIndex}</span> of{' '}
                    <span className="font-mono">{totalDays}</span>
                  </Chip>
                )}

                {daysLeft > 0 && (
                  <Chip icon={<Target className="text-cyan" />}>
                    <span className="font-mono">{daysLeft}</span> days to target
                  </Chip>
                )}

                {!isToday && <Badge tone="muted">Rest day today</Badge>}
              </div>

              <h1 className="mt-3.5 font-display text-fluid-h2 font-semibold tracking-tight text-ink">
                {isToday ? 'Today' : relativeDay(scheduledOn)}
              </h1>

              {headline && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1.5 text-ink-muted">
                    <Sparkles className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                    Focus
                  </span>
                  <span className="font-medium text-ink">{headline}</span>
                </p>
              )}
            </div>

            {local.length > 0 && (
              /*
                The day's read at a glance. On a phone this is a full-width row
                under the title — a 2x2 stat block there would push the first
                task below the fold, which is the one thing this screen exists
                to show.
              */
              <div className="glass relative flex shrink-0 items-center justify-between gap-4 rounded-card p-3.5 sm:flex-col-reverse sm:items-end sm:gap-3 sm:p-4">
                <div className="sm:text-right">
                  {/*
                    Monospaced, because this figure changes several times an
                    hour. A proportional font reflows the whole block on each
                    tick, and the eye reads that as the layout twitching.
                  */}
                  <p className="font-mono text-xl font-semibold leading-none tracking-tight sm:text-2xl">
                    {formatMinutes(doneMinutes)}
                    <span className="text-sm font-normal text-ink-muted">
                      {' / '}
                      {formatMinutes(plannedMinutes)}
                    </span>
                  </p>
                  <p className="mt-1.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
                    <span className="font-mono">{done.length}</span> of{' '}
                    <span className="font-mono">{local.length}</span> done
                  </p>
                </div>
                <Dial value={progress} size={52} stroke={5} tone={allDone ? 'success' : 'accent'} />
              </div>
            )}
          </div>

          {local.length > 0 && (
            <div className="relative mt-5 border-t border-glass-edge/[0.07] pt-3.5">
              <Progress
                value={progress}
                tone={allDone ? 'success' : 'accent'}
                label={`Today: ${progress}% complete`}
              />
            </div>
          )}
        </header>
      </FadeIn>

      {/* -------------------------------------------------------------- overdue */}
      {overdue.length > 0 && (
        <FadeIn delay={0.06}>
          <Callout
            tone="warn"
            icon={<AlertTriangle />}
            title={`${overdue.length} item${overdue.length === 1 ? '' : 's'} to catch up on`}
            action={
              <Button variant="secondary" size="sm" onClick={replan} loading={replanning}>
                <RefreshCw />
                Auto-reschedule
              </Button>
            }
          >
            Roughly {formatMinutes(overdue.reduce((s, o) => s + o.estMinutes, 0))} of unfinished work
            from {relativeDay(overdue[overdue.length - 1].scheduledOn).toLowerCase()}. Kairo can
            balance it across your remaining days.
          </Callout>
        </FadeIn>
      )}

      {/* ------------------------------------------------------------ items */}
      <FadeIn delay={0.1}>
        <div className="mb-3.5 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold tracking-tight">
            {isToday ? "Today's work" : 'Scheduled work'}
            <span className="glass rounded-full px-2 py-0.5 font-mono text-2xs font-semibold text-ink-muted">
              {local.length}
            </span>
          </h2>
          <p className="hidden text-2xs text-ink-faint sm:block">
            Select an item for its material and a timer
          </p>
        </div>

        {local.length === 0 ? (
          <EmptyState
            icon={<CalendarOff />}
            title={isToday ? 'Nothing scheduled today' : 'No upcoming session'}
            description={
              isToday
                ? 'This is a scheduled rest day. Rest is part of the plan — or get ahead with a drill session.'
                : 'Your plan has no further sessions scheduled.'
            }
            action={
              <Button asChild variant="secondary">
                <Link href={`/plan/${planId}/drill`}>
                  <Brain className="h-4 w-4" />
                  Drill instead
                </Link>
              </Button>
            }
          />
        ) : (
          /*
            The spine.
            A continuous rail with one node per item, so the day reads as an
            ordered route rather than as a pile of cards. The node is also the
            completion control — the thing you look at to see where you are is
            the thing you press to move on.
          */
          <Spine x={SPINE_X} inset={{ top: '1.5rem', bottom: '1.5rem' }}>
            <ul className="space-y-2.5">
              {local.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  index={index}
                  planId={planId}
                  alsoFor={item.topics ? topicResources?.[item.topics.id] : undefined}
                  expanded={expanded === item.id}
                  busy={pendingIds.has(item.id)}
                  onToggle={() => toggle(item)}
                  onExpand={() => setExpanded((current) => (current === item.id ? null : item.id))}
                />
              ))}
            </ul>
          </Spine>
        )}
      </FadeIn>

      {/* ---------------------------------------------------------- complete */}
      <AnimatePresence>
        {allDone && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="glass relative overflow-hidden rounded-panel border-success/25 bg-gradient-to-b from-success/[0.1] to-transparent p-6 text-center shadow-[0_0_0_1px_rgb(var(--success)/0.2),0_18px_50px_-20px_rgb(var(--success)/0.4)] sm:p-8"
          >
            {/* Finishing the day is the one moment worth celebrating on this
                screen, so it gets its own orbit — the plan turning over. */}
            <div
              aria-hidden
              className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[130%] -translate-x-1/2 -translate-y-1/2 opacity-25"
            >
              <OrbitRings count={3} lit={0} />
            </div>
            <motion.span
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 320, damping: 18 }}
              className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15 text-success ring-1 ring-inset ring-success/25"
              style={{ boxShadow: '0 0 32px -6px rgb(var(--success) / 0.6)' }}
            >
              <PartyPopper className="h-6 w-6" />
            </motion.span>
            <h3 className="relative mt-4 font-display text-xl font-semibold tracking-tight">
              Today is complete
            </h3>
            <p className="relative mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
              {formatMinutes(doneMinutes)} logged. Come back tomorrow, or lock it in with a drill
              session while it is still fresh.
            </p>
            <div className="relative mt-5 flex justify-center">
              <Button asChild variant="secondary">
                <Link href={`/plan/${planId}/drill`}>
                  <Brain className="h-4 w-4 text-accent" />
                  Drill what you learned
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- pieces */

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="glass inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium text-ink-muted [&_svg]:size-3.5 [&_svg]:shrink-0">
      {icon}
      {children}
    </span>
  );
}

function ItemRow({
  item, index, planId, alsoFor, expanded, busy, onToggle, onExpand,
}: {
  item: SessionItem;
  index: number;
  planId: string;
  alsoFor?: Array<Resource | null>;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onExpand: () => void;
}) {
  const meta = ITEM_META[item.kind] ?? ITEM_META.learn;
  const isDone = item.status === 'done';
  const KindIcon = KIND_ICON[item.kind] ?? BookOpen;
  const panelId = `item-panel-${item.id}`;

  /**
   * The topic's other material, minus whatever is already shown above it.
   *
   * A video is hoisted to the front. On a `learn` item the primary resource is
   * whichever scored highest overall, which is frequently a doc — and "watch
   * this" is the affordance most learners reach for first, so it should not be
   * the third thing in the list.
   */
  const extras = React.useMemo(() => {
    const primary = item.resources?.id;
    const list = (alsoFor ?? []).filter((r): r is Resource => Boolean(r) && r!.id !== primary);

    const seen = new Set<string>();
    const unique = list.filter((r) => !seen.has(r.id) && seen.add(r.id));

    return unique.sort((a, b) => {
      const watchable = (r: Resource) => (r.kind === 'video' || r.kind === 'playlist' ? 0 : 1);
      return watchable(a) - watchable(b);
    });
  }, [alsoFor, item.resources?.id]);

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE, delay: Math.min(index * 0.04, 0.24) }}
      className="flex items-start gap-2"
    >
      {/*
        The node *is* the checkbox. A 44px target with the 30px node centred in
        it, so the visual rail and the tap area share a centre line.
      */}
      <Hint label={isDone ? 'Mark as not done' : 'Mark as done'}>
        <button
          onClick={onToggle}
          disabled={busy}
          aria-pressed={isDone}
          aria-label={isDone ? `Mark "${item.title}" as not done` : `Mark "${item.title}" as done`}
          className={cn(
            'group/node flex h-touch w-touch shrink-0 items-center justify-center rounded-full',
            'outline-none transition-transform duration-150 focus-visible:ring-2 focus-visible:ring-accent/60',
            'active:scale-90 disabled:pointer-events-none disabled:opacity-60',
          )}
        >
          <SpineNode state={isDone ? 'done' : expanded ? 'active' : 'pending'}>
            {isDone ? (
              <motion.span
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 22 }}
              >
                <Check className="h-4 w-4" strokeWidth={3} />
              </motion.span>
            ) : (
              <Check
                className="h-4 w-4 opacity-0 transition-opacity group-hover/node:opacity-45"
                strokeWidth={2.5}
              />
            )}
          </SpineNode>
        </button>
      </Hint>

      <div
        className={cn(
          'min-w-0 flex-1 overflow-hidden rounded-card transition-[border-color,box-shadow,opacity] duration-300',
          // Depth encodes state. The open item is nearest the viewer and lit;
          // a finished one recedes. That is the whole reason the glass system
          // exists — the learner should be able to find their place on this
          // screen without reading a word of it.
          isDone
            ? 'glass border-line/50 opacity-65'
            : expanded
              ? 'glass-raised border-accent/35 shadow-glow-lg'
              : 'glass sheen hover:border-accent/25 hover:shadow-glow',
        )}
      >
        <div className="flex items-start gap-2 p-3.5 sm:p-4">
          <button
            onClick={onExpand}
            aria-expanded={expanded}
            aria-controls={panelId}
            className="min-w-0 flex-1 rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <span className="flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider',
                  TONE_CLASSES[meta.tone],
                )}
              >
                <KindIcon className="h-3 w-3" />
                {meta.label}
              </span>

              <span className="inline-flex items-center gap-1 rounded-md border border-glass-edge/[0.08] bg-glass/[0.05] px-2 py-0.5 font-mono text-2xs font-medium text-ink-muted">
                <Clock className="h-3 w-3 text-ink-faint" />
                {formatMinutes(item.est_minutes)}
              </span>

              {item.topics && (
                <span className="hidden max-w-[14rem] items-center gap-1 truncate rounded-md border border-glass-edge/[0.08] bg-glass/[0.05] px-2 py-0.5 text-2xs font-medium text-ink-muted sm:inline-flex">
                  <Layers className="h-3 w-3 shrink-0 text-ink-faint" />
                  <span className="truncate">{item.topics.title}</span>
                  {item.topics.mastery > 0 && (
                    <span className="shrink-0 font-mono">· {item.topics.mastery}%</span>
                  )}
                </span>
              )}
            </span>

            <span
              className={cn(
                'mt-2 block font-display text-[0.9375rem] font-semibold leading-snug tracking-tight transition-colors sm:text-base',
                isDone ? 'text-ink-muted line-through' : 'text-ink',
              )}
            >
              {item.title}
            </span>
          </button>

          <button
            onClick={onExpand}
            tabIndex={-1}
            aria-hidden
            className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-glass/[0.12] hover:text-ink"
          >
            <ChevronDown
              className={cn(
                'h-4.5 w-4.5 transition-transform duration-200 ease-out',
                expanded && 'rotate-180 text-accent',
              )}
            />
          </button>
        </div>

        {/*
          Height-animated rather than mounted and unmounted. An item panel that
          appears instantly makes the rest of the day jump down the screen, and
          on a long day the learner loses their place every time they open one.
        */}
        <Collapsible open={expanded} className="border-t border-line/0">
          <div
            id={panelId}
            className="border-t border-glass-edge/[0.07] bg-glass/[0.03] px-3.5 pb-4 pt-4 sm:px-4"
          >
            {item.detail && (
              <p className="well rounded-xl border-l-2 border-accent/50 p-3.5 font-reading text-[0.9375rem] leading-relaxed text-ink-muted">
                {item.detail}
              </p>
            )}

            {item.resources && (
              <div className={cn(item.detail && 'mt-4')}>
                <ResourcePanel resource={item.resources} />
              </div>
            )}

            {extras.length > 0 && (
              <div className={cn((item.detail || item.resources) && 'mt-4')}>
                <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink-faint">
                  Also for this topic
                </p>
                <div className="space-y-2">
                  {extras.map((resource) => (
                    <ResourcePanel key={resource.id} resource={resource} compact />
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-glass-edge/[0.06] pt-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <SessionTimer minutes={item.est_minutes} onComplete={!isDone ? onToggle : undefined} />

                {item.topics && (
                  <Button asChild variant="secondary" size="sm">
                    <Link href={`/plan/${planId}/drill?topic=${item.topics.id}`}>
                      <Brain className="text-accent" />
                      Drill topic
                    </Link>
                  </Button>
                )}
              </div>

              <Button
                size="sm"
                variant={isDone ? 'ghost' : 'primary'}
                onClick={onToggle}
                loading={busy}
                className="w-full sm:w-auto"
              >
                {!isDone && <Check className="h-4 w-4" />}
                {isDone ? 'Mark as not done' : 'Mark completed'}
              </Button>
            </div>
          </div>
        </Collapsible>
      </div>
    </motion.li>
  );
}
