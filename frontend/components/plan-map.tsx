'use client';

import * as React from 'react';
import Link from 'next/link';
import { ChevronRight, Timer, Brain, Layers, Circle, CheckCircle2, Target, Sparkles } from 'lucide-react';
import { Card, Badge, Progress, Button, EmptyState } from './ui';
import { cn, formatMinutes, formatDate, pct } from '../lib/utils';

export interface MapTopic {
  id: string;
  idx: number;
  title: string;
  summary: string | null;
  outcomes: string[];
  estMinutes: number;
  difficulty: number;
  mastery: number;
  done: number;
  total: number;
  firstDay: number | null;
  firstDate: string | null;
  resourceCount: number;
  scheduled: boolean;
}

export interface MapUnit {
  id: string;
  idx: number;
  title: string;
  summary: string | null;
  weight: number;
  topics: MapTopic[];
}

interface Mock {
  id: string;
  title: string;
  scheduledOn: string | null;
  durationMin: number;
}

export function PlanMap({
  planId,
  units,
  mocks,
}: {
  planId: string;
  units: MapUnit[];
  mocks: Mock[];
}) {
  const [open, setOpen] = React.useState<string | null>(units[0]?.id ?? null);

  const allTopics = units.flatMap((u) => u.topics);
  const scheduled = allTopics.filter((t) => t.scheduled);
  const optional = allTopics.filter((t) => !t.scheduled);

  const totalMinutes = scheduled.reduce((s, t) => s + t.estMinutes, 0);
  const doneItems = allTopics.reduce((s, t) => s + t.done, 0);
  const totalItems = allTopics.reduce((s, t) => s + t.total, 0);

  if (!units.length) {
    return (
      <EmptyState
        icon={<Layers className="h-5 w-5" />}
        title="No map yet"
        description="This plan has not finished building."
      />
    );
  }

  return (
    <div className="animate-in">
      <h1 className="font-display text-fluid-h2 font-semibold">The map</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Everything between now and your target, in the order it should be learned.
      </p>

      {/* ---------------------------------------------------------- stats */}
      <div className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
        <Stat label="Units" value={String(units.length)} />
        <Stat label="Topics" value={String(scheduled.length)} />
        <Stat label="Study time" value={formatMinutes(totalMinutes)} />
        <Stat label="Assessments" value={String(mocks.length)} />
      </div>

      <Progress value={pct(doneItems, totalItems)} className="mt-6" />
      <p className="tabular mt-2 text-xs text-ink-faint">
        {doneItems} of {totalItems} scheduled items complete
      </p>

      {/* ---------------------------------------------------------- units */}
      <div className="mt-8 space-y-3">
        {units.map((unit) => {
          const expanded = open === unit.id;
          const unitDone = unit.topics.reduce((s, t) => s + t.done, 0);
          const unitTotal = unit.topics.reduce((s, t) => s + t.total, 0);
          const unitProgress = pct(unitDone, unitTotal);
          const mastery = unit.topics.length
            ? Math.round(unit.topics.reduce((s, t) => s + t.mastery, 0) / unit.topics.length)
            : 0;

          return (
            <Card key={unit.id} className={cn('overflow-hidden', expanded && 'border-accent/25')}>
              <button
                onClick={() => setOpen(expanded ? null : unit.id)}
                className="flex w-full items-center gap-3 p-4 text-left sm:gap-4 sm:p-5"
                aria-expanded={expanded}
              >
                <span
                  className={cn(
                    'tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
                    unitProgress === 100
                      ? 'bg-success/15 text-success'
                      : unitProgress > 0
                        ? 'bg-accent/12 text-accent'
                        : 'bg-surface-3 text-ink-faint',
                  )}
                >
                  {unit.idx + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-base font-semibold">{unit.title}</h2>
                    {unit.weight >= 4 && <Badge tone="warn">High yield</Badge>}
                  </div>
                  {unit.summary && (
                    <p className="mt-1 line-clamp-1 text-xs text-ink-muted">{unit.summary}</p>
                  )}

                  <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:gap-3">
                    <Progress value={unitProgress} className="w-full sm:max-w-[180px]" />
                    <span className="tabular text-2xs text-ink-faint">
                      {unit.topics.length} topics · mastery {mastery}%
                    </span>
                  </div>
                </div>

                <ChevronRight
                  className={cn(
                    'h-4 w-4 shrink-0 text-ink-faint transition-transform',
                    expanded && 'rotate-90',
                  )}
                />
              </button>

              {expanded && (
                <ul className="border-t border-line animate-in">
                  {unit.topics.map((topic) => (
                    <TopicRow key={topic.id} topic={topic} planId={planId} />
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      {/* ---------------------------------------------------------- mocks */}
      {mocks.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-base font-semibold">Assessments</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Spaced through the plan so gaps surface early, not the week before.
          </p>
          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {mocks.map((mock) => (
              <Card key={mock.id} className="flex items-center gap-3 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/12 text-danger">
                  <Target className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{mock.title}</p>
                  <p className="tabular text-2xs text-ink-faint">
                    {mock.scheduledOn ? formatDate(mock.scheduledOn, { year: 'numeric' }) : 'Unscheduled'} ·{' '}
                    {formatMinutes(mock.durationMin)}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------- optional */}
      {optional.length > 0 && (
        <section className="mt-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-ink-faint" />
            <h2 className="font-display text-base font-semibold">Stretch topics</h2>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">
            These did not fit your timeline, so they were left out rather than squeezed in at the
            cost of everything else. Extend your target date and they come back in.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {optional.map((topic) => (
              <span
                key={topic.id}
                className="rounded-lg border border-dashed border-line px-2.5 py-1.5 text-xs text-ink-muted"
              >
                {topic.title}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-3 sm:p-4">
      <p className="tabular font-display text-lg font-semibold sm:text-xl">{value}</p>
      <p className="mt-0.5 text-2xs uppercase tracking-wider text-ink-faint">{label}</p>
    </Card>
  );
}

function TopicRow({ topic, planId }: { topic: MapTopic; planId: string }) {
  const [open, setOpen] = React.useState(false);
  const complete = topic.total > 0 && topic.done === topic.total;

  return (
    <li className="border-b border-line last:border-0">
      <button onClick={() => setOpen((v) => !v)} className="flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 sm:px-5">
        {complete ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        ) : (
          <Circle
            className={cn('h-4 w-4 shrink-0', topic.done > 0 ? 'text-accent' : 'text-ink-faint')}
          />
        )}

        <div className="min-w-0 flex-1">
          <p className={cn('truncate text-sm', complete && 'text-ink-muted')}>{topic.title}</p>
          <div className="tabular mt-0.5 flex flex-wrap items-center gap-2.5 text-2xs text-ink-faint">
            <span className="flex items-center gap-1">
              <Timer className="h-2.5 w-2.5" />
              {formatMinutes(topic.estMinutes)}
            </span>
            {topic.resourceCount > 0 && <span>{topic.resourceCount} resources</span>}
            {topic.firstDate && <span>starts {formatDate(topic.firstDate)}</span>}
            {!topic.scheduled && <span className="text-warn">optional</span>}
          </div>
        </div>

        <MasteryPip mastery={topic.mastery} />
      </button>

      {open && (
        <div className="border-t border-line bg-surface-2/50 px-4 py-4 animate-in sm:px-5">
          {topic.summary && <p className="text-sm leading-relaxed text-ink-muted">{topic.summary}</p>}

          {topic.outcomes.length > 0 && (
            <div className="mt-3">
              <p className="text-2xs font-medium uppercase tracking-wider text-ink-faint">
                You should be able to
              </p>
              <ul className="mt-1.5 space-y-1">
                {topic.outcomes.map((outcome) => (
                  <li key={outcome} className="flex gap-2 text-sm text-ink-muted">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
                    {outcome}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 flex items-center gap-2">
            <Link href={`/plan/${planId}/drill?topic=${topic.id}`}>
              <Button variant="secondary" size="sm">
                <Brain className="h-3.5 w-3.5" />
                Drill this topic
              </Button>
            </Link>
            <span className="tabular text-2xs text-ink-faint">
              difficulty {topic.difficulty}/5
            </span>
          </div>
        </div>
      )}
    </li>
  );
}

/** Five pips: a glanceable mastery read that needs no legend. */
function MasteryPip({ mastery }: { mastery: number }) {
  const filled = Math.round((mastery / 100) * 5);
  return (
    <span className="flex shrink-0 items-center gap-0.5" title={`Mastery ${mastery}%`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-3 w-1 rounded-full',
            i < filled ? (mastery >= 70 ? 'bg-success' : 'bg-accent') : 'bg-surface-3',
          )}
        />
      ))}
    </span>
  );
}
