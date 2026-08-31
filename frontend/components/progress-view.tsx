'use client';

import * as React from 'react';
import Link from 'next/link';
import { Flame, Clock, CalendarDays, TrendingUp, TrendingDown, Minus, Brain, AlertTriangle } from 'lucide-react';
import { Card, Badge, Button, Progress } from './ui';
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

const STATUS_COPY: Record<ProgressData['status'], { label: string; tone: string; icon: typeof TrendingUp; line: string }> = {
  ahead: { label: 'Ahead of schedule', tone: 'success', icon: TrendingUp, line: 'You have built a buffer. Use it on the topics you find hardest, not on finishing early.' },
  'on-track': { label: 'On pace', tone: 'success', icon: Minus, line: 'Progress matches the calendar. Keep the streak and this lands on time.' },
  slipping: { label: 'Slipping', tone: 'warn', icon: TrendingDown, line: 'A little behind. One reschedule now costs less than three more weeks of drift.' },
  behind: { label: 'Behind schedule', tone: 'danger', icon: TrendingDown, line: 'Meaningfully behind. Reschedule, or move the target date — do not just study faster.' },
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

  return (
    <div className="animate-in">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Progress</h1>
      <p className="mt-1.5 text-sm text-ink-muted">
        Measured from what you actually completed, not from what the plan hoped for.
      </p>

      {/* ---------------------------------------------------------- pace */}
      <Card className="mt-7 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge tone={status.tone}>
              <StatusIcon className="h-3 w-3" />
              {status.label}
            </Badge>
            <p className="mt-3 font-display text-3xl font-semibold">
              {data.donePct}<span className="text-lg text-ink-faint">%</span>
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              complete · schedule expects {data.expectedPct}%
            </p>
          </div>

          <div className="text-right">
            <p className="font-display text-3xl font-semibold">{data.daysLeft}</p>
            <p className="mt-1 text-xs text-ink-muted">
              days left · target {formatDate(targetDate, { year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Progress against an expectation marker — one axis, no dual scale. */}
        <div className="relative mt-6">
          <Progress
            value={data.donePct}
            tone={data.status === 'behind' || data.status === 'slipping' ? 'accent' : 'success'}
            className="h-2"
          />
          <div
            className="absolute -top-1 h-4 w-px bg-ink-faint"
            style={{ left: `${Math.min(100, data.expectedPct)}%` }}
            aria-hidden
          />
          <span
            className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-2xs text-ink-faint"
            style={{ left: `${Math.min(96, Math.max(4, data.expectedPct))}%` }}
          >
            on schedule
          </span>
        </div>

        <p className="mt-5 text-sm leading-relaxed text-ink-muted">{status.line}</p>

        {data.overdueItems > 0 && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-warn/25 bg-warn/[0.07] px-3 py-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warn" />
            <p className="flex-1 text-xs">
              {data.overdueItems} item{data.overdueItems === 1 ? '' : 's'} overdue.
            </p>
            <Link href={`/plan/${planId}/today`}>
              <Button size="sm" variant="secondary">Fix on Today</Button>
            </Link>
          </div>
        )}
      </Card>

      {/* --------------------------------------------------------- tiles */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          icon={<Flame className="h-4 w-4" />}
          value={String(data.streak)}
          label="day streak"
          hint={data.longestStreak > data.streak ? `best ${data.longestStreak}` : 'personal best'}
          accent={data.streak > 0}
        />
        <Tile
          icon={<Clock className="h-4 w-4" />}
          value={formatMinutes(data.minutesTotal)}
          label="total studied"
          hint={`${formatMinutes(data.minutesLast7)} this week`}
        />
        <Tile
          icon={<TrendingUp className="h-4 w-4" />}
          value={formatMinutes(data.dailyAverage)}
          label="daily average"
          hint={`target ${formatMinutes(dailyTarget)}`}
        />
        <Tile
          icon={<CalendarDays className="h-4 w-4" />}
          value={formatMinutes(data.requiredPace)}
          label="needed per day"
          hint={
            paceGap > 15 ? `${formatMinutes(paceGap)} above your pace`
            : paceGap < -15 ? 'comfortably under pace'
            : 'matches your pace'
          }
          warn={paceGap > 15}
        />
      </div>

      {/* ------------------------------------------------------- heatmap */}
      <Card className="mt-4 p-6">
        <StudyHeatmap days={data.heatmap} dailyTarget={dailyTarget} />
      </Card>

      {/* ---------------------------------------------------- projection */}
      {data.projectedFinish && (
        <Card className="mt-4 p-5">
          <h2 className="font-display text-base font-semibold">Projection</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            At your pace over the last seven days, you finish around{' '}
            <span className="font-medium text-ink">
              {formatDate(data.projectedFinish, { year: 'numeric' })}
            </span>
            {new Date(data.projectedFinish) > new Date(targetDate) ? (
              <span className="text-warn"> — after your target.</span>
            ) : (
              <span className="text-success"> — comfortably inside your target.</span>
            )}
          </p>
        </Card>
      )}

      {/* --------------------------------------------------------- units */}
      {data.units.length > 0 && (
        <Card className="mt-4 p-6">
          <h2 className="font-display text-base font-semibold">Mastery by unit</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Built from drill accuracy and recall intervals, not from items ticked off.
          </p>
          <MasteryBars units={data.units} />
        </Card>
      )}

      {/* ----------------------------------------------------- weakest */}
      {data.weakTopics.length > 0 && (
        <Card className="mt-4 p-6">
          <h2 className="font-display text-base font-semibold">Weakest right now</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            The highest-leverage places to spend your next drill session.
          </p>
          <ul className="mt-4 space-y-2">
            {data.weakTopics.map((topic) => (
              <li key={topic.id} className="flex items-center gap-3">
                <span className="tabular w-9 shrink-0 text-xs text-ink-faint">{topic.mastery}%</span>
                <span className="min-w-0 flex-1 truncate text-sm">{topic.title}</span>
                <Link href={`/plan/${planId}/drill?topic=${topic.id}`}>
                  <Button size="sm" variant="ghost">
                    <Brain className="h-3.5 w-3.5" />
                    Drill
                  </Button>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ tiles */

function Tile({
  icon, value, label, hint, accent, warn,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
  hint?: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <Card className="p-4">
      <span
        className={cn(
          'flex h-7 w-7 items-center justify-center rounded-lg',
          warn ? 'bg-warn/12 text-warn' : accent ? 'bg-accent/12 text-accent' : 'bg-surface-3 text-ink-faint',
        )}
      >
        {icon}
      </span>
      {/* Proportional figures: tabular-nums makes display sizes look loose. */}
      <p className="mt-3 font-display text-xl font-semibold leading-none">{value}</p>
      <p className="mt-1.5 text-2xs uppercase tracking-wider text-ink-faint">{label}</p>
      {hint && <p className="mt-1 text-2xs text-ink-muted">{hint}</p>}
    </Card>
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
        <div key={unit.title} className="group">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 flex-1 truncate text-xs">{unit.title}</span>
            <span className="tabular shrink-0 text-xs font-medium text-ink-muted">
              {unit.mastery}%
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-700 ease-out"
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
