'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Flame, Clock, CalendarDays, TrendingUp, TrendingDown, Minus, Brain, AlertTriangle,
} from 'lucide-react';
import {
  Card, Badge, Button, Progress, Stat, PageHeader, SectionHeader, Callout, FadeIn, CountUp,
} from './ui';
import { StudyHeatmap, type HeatDay } from './study-heatmap';
import { cn, formatMinutes, formatDate } from '../lib/utils';

export interface ProgressData {
  donePct: number;
  expectedPct: number;
  drift: number;
  status: 'ahead' | 'on-track' | 'slipping' | 'behind';
  streak: number;
  longestStreak: number;
  minutesTotal: number;
  minutesLast7: number;
  dailyAverage: number;
  daysElapsed: number;
  daysTotal: number;
  daysLeft: number;
  overdueItems: number;
  requiredPace: number;
  projectedFinish: string | null;
  heatmap: HeatDay[];
  byKind: Array<{ kind: string; done: number; total: number }>;
  units: Array<{ title: string; mastery: number; done: number; total: number }>;
  weakTopics: Array<{ id: string; title: string; mastery: number }>;
}

const STATUS_COPY: Record<
  ProgressData['status'],
  { label: string; tone: string; icon: typeof TrendingUp; line: string }
> = {
  ahead: {
    label: 'Ahead of schedule', tone: 'success', icon: TrendingUp,
    line: 'You have built a buffer. Use it on the topics you find hardest, not on finishing early.',
  },
  'on-track': {
    label: 'On pace', tone: 'success', icon: Minus,
    line: 'Progress matches the calendar. Keep the streak and this lands on time.',
  },
  slipping: {
    label: 'Slipping', tone: 'warn', icon: TrendingDown,
    line: 'A little behind. One reschedule now costs less than three more weeks of drift.',
  },
  behind: {
    label: 'Behind schedule', tone: 'danger', icon: TrendingDown,
    line: 'Meaningfully behind. Reschedule, or move the target date — do not just study faster.',
  },
};

export function ProgressView({
  planId,
  data,
  dailyTarget,
  targetDate,
}: {
  planId: string;
  data: ProgressData;
  dailyTarget: number;
  targetDate: string;
}) {
  const status = STATUS_COPY[data.status];
  const StatusIcon = status.icon;
  const paceGap = data.requiredPace - Math.round(data.minutesLast7 / 7);
  const late = data.projectedFinish ? new Date(data.projectedFinish) > new Date(targetDate) : false;

  return (
    <div className="space-y-6">
      <FadeIn>
        <PageHeader
          title="Progress"
          description="Measured from what you actually completed, not from what the plan hoped for."
        />
      </FadeIn>

      {/* ---------------------------------------------------------- pace */}
      <FadeIn delay={0.05}>
        <Card className="p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
            <div>
              <Badge tone={status.tone}>
                <StatusIcon />
                {status.label}
              </Badge>
              <p className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                <CountUp value={data.donePct} />
                <span className="text-lg text-ink-faint">%</span>
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                complete · schedule expects <span className="tabular">{data.expectedPct}%</span>
              </p>
            </div>

            <div className="text-right">
              <p className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                <CountUp value={data.daysLeft} />
              </p>
              <p className="mt-1 text-xs text-ink-muted">
                days left · target {formatDate(targetDate, { year: 'numeric' })}
              </p>
            </div>
          </div>

          {/*
            Progress against an expectation marker — one axis, no dual scale.
            The marker's label is clamped away from both ends so it never runs
            off the edge of the card on a narrow screen.
          */}
          <div className="relative mt-8">
            <Progress
              value={data.donePct}
              tone={data.status === 'behind' ? 'danger' : data.status === 'slipping' ? 'warn' : 'success'}
              className="h-2"
              label={`${data.donePct}% complete against a ${data.expectedPct}% expectation`}
            />
            <span
              aria-hidden
              className="absolute -top-1 h-4 w-px bg-ink-faint"
              style={{ left: `${Math.min(100, data.expectedPct)}%` }}
            />
            <span
              aria-hidden
              className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-2xs text-ink-faint"
              style={{ left: `${Math.min(88, Math.max(12, data.expectedPct))}%` }}
            >
              on schedule
            </span>
          </div>

          <p className="mt-5 max-w-measure text-sm leading-relaxed text-ink-muted">{status.line}</p>

          {data.overdueItems > 0 && (
            <Callout
              tone="warn"
              className="mt-4"
              icon={<AlertTriangle />}
              title={`${data.overdueItems} item${data.overdueItems === 1 ? '' : 's'} overdue`}
              action={
                <Button asChild size="sm" variant="secondary">
                  <Link href={`/plan/${planId}/today`}>Fix on Today</Link>
                </Button>
              }
            />
          )}
        </Card>
      </FadeIn>

      {/* --------------------------------------------------------- tiles */}
      <FadeIn delay={0.1}>
        {/*
          Two columns on a phone, four from `sm` up. The old `lg:grid-cols-4`
          only kicked in at a 1024px *viewport*, but this column is capped well
          below that — so on a laptop the tiles stayed stacked two-wide with
          half the row empty.
        */}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
          <Stat
            icon={<Flame />}
            tone={data.streak > 0 ? 'accent' : 'default'}
            value={data.streak}
            label="day streak"
            hint={data.longestStreak > data.streak ? `best ${data.longestStreak}` : 'personal best'}
          />
          <Stat
            icon={<Clock />}
            value={formatMinutes(data.minutesTotal)}
            label="total studied"
            hint={`${formatMinutes(data.minutesLast7)} this week`}
          />
          <Stat
            icon={<TrendingUp />}
            value={formatMinutes(data.dailyAverage)}
            label="daily average"
            hint={`target ${formatMinutes(dailyTarget)}`}
          />
          <Stat
            icon={<CalendarDays />}
            tone={paceGap > 15 ? 'warn' : 'default'}
            value={formatMinutes(data.requiredPace)}
            label="needed per day"
            hint={
              paceGap > 15
                ? `${formatMinutes(paceGap)} above your pace`
                : paceGap < -15
                  ? 'comfortably under pace'
                  : 'matches your pace'
            }
          />
        </div>
      </FadeIn>

      {/* ------------------------------------------------------- heatmap */}
      <FadeIn delay={0.15}>
        <Card className="p-4 sm:p-6">
          <StudyHeatmap days={data.heatmap} dailyTarget={dailyTarget} />
        </Card>
      </FadeIn>

      {/* ---------------------------------------------------- projection */}
      {data.projectedFinish && (
        <Card className="p-4 sm:p-5">
          <SectionHeader title="Projection" />
          <p className="mt-2 max-w-measure text-sm leading-relaxed text-ink-muted">
            At your pace over the last seven days, you finish around{' '}
            <span className="font-medium text-ink">
              {formatDate(data.projectedFinish, { year: 'numeric' })}
            </span>
            {late ? (
              <span className="text-warn"> — after your target.</span>
            ) : (
              <span className="text-success"> — comfortably inside your target.</span>
            )}
          </p>
        </Card>
      )}

      {/*
        Mastery and weak topics sit side by side once there is room. They are
        read together — "where am I strong" and "what do I do about it" — and
        stacking them on a wide screen pushes the answer below the fold.
      */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {data.units.length > 0 && (
          <Card className="p-4 sm:p-6">
            <SectionHeader
              title="Mastery by unit"
              description="Built from drill accuracy and recall intervals, not from items ticked off."
            />
            <MasteryBars units={data.units} />
          </Card>
        )}

        {data.weakTopics.length > 0 && (
          <Card className="p-4 sm:p-6">
            <SectionHeader
              title="Weakest right now"
              description="The highest-leverage places to spend your next drill session."
            />
            <ul className="mt-4 space-y-1">
              {data.weakTopics.map((topic) => (
                <li key={topic.id} className="flex items-center gap-3">
                  <span className="tabular w-9 shrink-0 text-xs text-ink-faint">{topic.mastery}%</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{topic.title}</span>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/plan/${planId}/drill?topic=${topic.id}`}>
                      <Brain />
                      Drill
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

/**
 * Horizontal bars, one series.
 *
 * One series means no legend and one colour — the title names what is measured.
 * Values are direct-labelled at the bar end because the value *is* the point
 * here; there is no axis to carry it.
 */
function MasteryBars({ units }: { units: ProgressData['units'] }) {
  return (
    <div className="mt-5 space-y-3">
      {units.map((unit) => (
        <div key={unit.title}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-xs">{unit.title}</span>
            <span className="tabular shrink-0 text-xs font-medium text-ink-muted">{unit.mastery}%</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700 ease-out',
                unit.mastery >= 70 ? 'bg-success' : 'bg-accent',
              )}
              style={{ width: `${Math.max(unit.mastery, unit.mastery > 0 ? 2 : 0)}%` }}
              role="img"
              aria-label={`${unit.title}: ${unit.mastery}% mastery`}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
