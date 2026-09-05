'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ChevronRight, Timer, Brain, Layers, Circle, CheckCircle2, Target, Sparkles,
  BookMarked, Play, Library,
} from 'lucide-react';
import {
  Card, Badge, Progress, Button, EmptyState, PageHeader, SectionHeader, Stat,
  Accordion, AccordionItem, AccordionTrigger, AccordionContent, Hint, FadeIn,
} from './ui';
import { ResourcePanel, type Resource } from './resource-panel';
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
  /**
   * The topic's shelf, best-ranked first.
   *
   * Was a bare `resourceCount`. A number told the learner material existed and
   * gave them no way to open it, which is the worst of both — it advertises
   * something the screen cannot deliver.
   */
  resources: Resource[];
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
  const [open, setOpen] = React.useState<string[]>(units[0] ? [units[0].id] : []);

  const allTopics = units.flatMap((u) => u.topics);
  const scheduled = allTopics.filter((t) => t.scheduled);
  const optional = allTopics.filter((t) => !t.scheduled);

  const totalMinutes = scheduled.reduce((s, t) => s + t.estMinutes, 0);
  const doneItems = allTopics.reduce((s, t) => s + t.done, 0);
  const totalItems = allTopics.reduce((s, t) => s + t.total, 0);
  const overall = pct(doneItems, totalItems);

  if (!units.length) {
    return (
      <EmptyState
        icon={<Layers />}
        title="No map yet"
        description="This plan has not finished building."
      />
    );
  }

  const allOpen = open.length === units.length;

  return (
    <div className="space-y-8">
      <FadeIn>
        <PageHeader
          title="The map"
          description="Everything between now and your target, in the order it should be learned."
          actions={
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setOpen(allOpen ? [] : units.map((u) => u.id))}
            >
              {allOpen ? 'Collapse all' : 'Expand all'}
            </Button>
          }
        />
      </FadeIn>

      {/* ---------------------------------------------------------- stats */}
      <FadeIn delay={0.05}>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <Stat value={units.length} label="Units" />
          <Stat value={scheduled.length} label="Topics" />
          <Stat value={formatMinutes(totalMinutes)} label="Study time" />
          <Stat value={mocks.length} label="Assessments" />
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <span className="tabular text-xs text-ink-muted">
              {doneItems} of {totalItems} scheduled items complete
            </span>
            <span className="tabular text-xs font-semibold text-accent">{overall}%</span>
          </div>
          <Progress value={overall} label={`Plan progress: ${overall}%`} />
        </div>
      </FadeIn>

      {/* ---------------------------------------------------------- units */}
      <FadeIn delay={0.1}>
        <Accordion
          type="multiple"
          value={open}
          onValueChange={setOpen}
          className="space-y-3"
        >
          {units.map((unit) => {
            const unitDone = unit.topics.reduce((s, t) => s + t.done, 0);
            const unitTotal = unit.topics.reduce((s, t) => s + t.total, 0);
            const unitProgress = pct(unitDone, unitTotal);
            const mastery = unit.topics.length
              ? Math.round(unit.topics.reduce((s, t) => s + t.mastery, 0) / unit.topics.length)
              : 0;
            const complete = unitProgress === 100;

            return (
              <AccordionItem
                key={unit.id}
                value={unit.id}
                className={cn(
                  'surface rounded-card transition-colors',
                  open.includes(unit.id) && 'border-accent/25',
                )}
              >
                <AccordionTrigger className="gap-3 p-4 sm:gap-4 sm:p-5" hideChevron>
                  <span
                    className={cn(
                      'tabular flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold',
                      complete
                        ? 'bg-success/15 text-success'
                        : unitProgress > 0
                          ? 'bg-accent/12 text-accent'
                          : 'bg-glass/[0.08] text-ink-faint',
                    )}
                  >
                    {unit.idx + 1}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-semibold tracking-tight">
                        {unit.title}
                      </span>
                      {unit.weight >= 4 && <Badge tone="warn">High yield</Badge>}
                      {complete && <Badge tone="success">Done</Badge>}
                    </span>

                    {unit.summary && (
                      <span className="mt-1 line-clamp-1 block font-reading text-xs text-ink-muted">
                        {unit.summary}
                      </span>
                    )}

                    {/*
                      The bar and its caption stack on a phone, where sitting
                      them side by side leaves the bar about 60px wide and
                      unreadable, and sit inline once there is room.
                    */}
                    <span className="mt-2.5 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                      <Progress
                        value={unitProgress}
                        tone={complete ? 'success' : 'accent'}
                        className="w-full sm:max-w-[180px]"
                        label={`${unit.title}: ${unitProgress}% complete`}
                      />
                      <span className="tabular text-2xs text-ink-faint">
                        {unit.topics.length} topics · mastery {mastery}%
                      </span>
                    </span>
                  </span>

                  <ChevronRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 self-center text-ink-faint transition-transform duration-200 ease-out group-data-[state=open]:rotate-90"
                  />
                </AccordionTrigger>

                <AccordionContent>
                  <ul className="border-t border-line">
                    {unit.topics.map((topic) => (
                      <TopicRow key={topic.id} topic={topic} planId={planId} />
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </FadeIn>

      {/* ---------------------------------------------------------- mocks */}
      {mocks.length > 0 && (
        <section>
          <SectionHeader
            icon={<Target className="h-4 w-4 text-danger" />}
            title="Assessments"
            description="Spaced through the plan so gaps surface early, not the week before."
          />
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 3xl:grid-cols-3">
            {mocks.map((mock) => (
              <Card key={mock.id} className="flex items-center gap-3 p-4">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-danger/12 text-danger">
                  <Target className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{mock.title}</p>
                  <p className="tabular text-2xs text-ink-faint">
                    {mock.scheduledOn ? formatDate(mock.scheduledOn, { year: 'numeric' }) : 'Unscheduled'}
                    {' · '}
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
        <section>
          <SectionHeader
            icon={<Sparkles className="h-4 w-4 text-ink-faint" />}
            title="Stretch topics"
            description="These did not fit your timeline, so they were left out rather than squeezed in at the cost of everything else. Extend your target date and they come back in."
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {optional.map((topic) => (
              <span
                key={topic.id}
                className="rounded-field border border-dashed border-line px-2.5 py-1.5 text-xs text-ink-muted"
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

function TopicRow({ topic, planId }: { topic: MapTopic; planId: string }) {
  const [open, setOpen] = React.useState(false);
  const complete = topic.total > 0 && topic.done === topic.total;
  const panelId = `topic-${topic.id}`;

  /*
    Videos first. The map is where a learner decides what to do next, and the
    decision is usually "is there something I can watch on this". Ordering by
    curation rank alone buried the video under a docs page about half the time.
  */
  const resources = React.useMemo(
    () =>
      [...topic.resources].sort((a, b) => {
        const watchable = (r: Resource) => (r.kind === 'video' || r.kind === 'playlist' ? 0 : 1);
        return watchable(a) - watchable(b);
      }),
    [topic.resources],
  );

  const hasVideo = resources.some((r) => r.kind === 'video' || r.kind === 'playlist');

  return (
    <li className="border-b border-line last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex min-h-touch w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-glass/[0.08] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 sm:px-5"
      >
        {complete ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />
        ) : (
          <Circle
            aria-hidden
            className={cn('h-4 w-4 shrink-0', topic.done > 0 ? 'text-accent' : 'text-ink-faint')}
          />
        )}

        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm', complete && 'text-ink-muted')}>
            {topic.title}
          </span>
          <span className="tabular mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-2xs text-ink-faint">
            <span className="flex items-center gap-1">
              <Timer className="h-2.5 w-2.5" />
              {formatMinutes(topic.estMinutes)}
            </span>
            {topic.resources.length > 0 && (
              <span className="flex items-center gap-1">
                {/* A play glyph when something is watchable, because "there is a
                    video here" is the fact a learner scans for. */}
                {hasVideo ? <Play className="h-2.5 w-2.5" /> : <BookMarked className="h-2.5 w-2.5" />}
                {topic.resources.length}
              </span>
            )}
            {topic.firstDate && <span>starts {formatDate(topic.firstDate)}</span>}
            {!topic.scheduled && <span className="text-warn">optional</span>}
          </span>
        </span>

        <MasteryPip mastery={topic.mastery} />

        <ChevronRight
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-ink-faint transition-transform duration-200',
            open && 'rotate-90',
          )}
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="animate-in fade-in-0 slide-in-from-top-1 border-t border-glass-edge/[0.07] bg-glass/[0.03] px-4 py-4 duration-200 sm:px-5"
        >
          {topic.summary && (
            <p className="max-w-measure font-reading text-[0.9375rem] leading-relaxed text-ink-muted">
              {topic.summary}
            </p>
          )}

          {topic.outcomes.length > 0 && (
            <div className={cn(topic.summary && 'mt-3')}>
              <p className="text-2xs font-medium uppercase tracking-wider text-ink-faint">
                You should be able to
              </p>
              <ul className="mt-1.5 space-y-1">
                {topic.outcomes.map((outcome) => (
                  <li
                    key={outcome}
                    className="flex max-w-measure gap-2 font-reading text-[0.9375rem] leading-relaxed text-ink-muted"
                  >
                    <span className="mt-[0.4375rem] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                    {outcome}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            The material, playable in place.

            `ResourcePanel` embeds YouTube inline, so a learner can watch the
            lecture for a topic straight from the syllabus view without losing
            their place in it.
          */}
          {resources.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink-faint">
                Material for this topic
              </p>
              <div className="space-y-2">
                {resources.map((resource, i) => (
                  <ResourcePanel key={resource.id} resource={resource} compact={i > 0} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button asChild variant="secondary" size="sm">
              <Link href={`/plan/${planId}/drill?topic=${topic.id}`}>
                <Brain />
                Drill this topic
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              {/* Pre-filters the Library to this topic, which is the other half
                  of "I can search for it" — see `?q=` in library/page.tsx. */}
              <Link href={`/plan/${planId}/library?q=${encodeURIComponent(topic.title)}`}>
                <Library />
                All resources
              </Link>
            </Button>
            <span className="font-mono text-2xs text-ink-faint">difficulty {topic.difficulty}/5</span>
          </div>
        </div>
      )}
    </li>
  );
}

/**
 * Five pips: a glanceable mastery read that needs no legend.
 *
 * The count of filled pips carries the value, so the reading does not depend
 * on separating violet from emerald — the colour only adds the "past 70%"
 * threshold on top of a signal that is already there.
 */
function MasteryPip({ mastery }: { mastery: number }) {
  const filled = Math.round((mastery / 100) * 5);

  return (
    <Hint label={`Mastery ${mastery}%`}>
      <span className="flex shrink-0 items-center gap-0.5" role="img" aria-label={`Mastery ${mastery}%`}>
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={cn(
              'h-3 w-1 rounded-full transition-colors',
              i < filled ? (mastery >= 70 ? 'bg-success' : 'bg-accent-vivid') : 'bg-surface-sunken',
            )}
          />
        ))}
      </span>
    </Hint>
  );
}
