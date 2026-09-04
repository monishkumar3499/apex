'use client';

import * as React from 'react';
import { Table2, LayoutGrid } from 'lucide-react';
import { SectionHeader, SegmentedTabs, Hint } from './ui';
import { formatMinutes, formatDate } from '../lib/utils';

export interface HeatDay {
  date: string;
  minutes: number;
}

/**
 * Study heatmap — sequential magnitude on a calendar.
 *
 * Colour is a single-hue ramp defined in globals.css (`.viz-heat`), bucketed
 * against the learner's own daily target rather than against a global maximum,
 * so "a good day" means the same thing in week 1 and week 20.
 *
 * Colour is never the only channel: every cell is focusable and labelled, and
 * the table view is the WCAG-clean twin of the same data.
 */
export function StudyHeatmap({
  days,
  dailyTarget,
}: {
  days: HeatDay[];
  dailyTarget: number;
}) {
  const [view, setView] = React.useState<'grid' | 'table'>('grid');

  const target = Math.max(30, dailyTarget);

  const bucket = (minutes: number): 0 | 1 | 2 | 3 | 4 => {
    if (minutes <= 0) return 0;
    const ratio = minutes / target;
    if (ratio < 0.5) return 1;
    if (ratio < 1) return 2;
    if (ratio < 1.5) return 3;
    return 4;
  };

  // Pad to a whole number of weeks, starting on Sunday.
  const padded = React.useMemo(() => {
    if (!days.length) return [];
    const lead = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
    return [...Array.from({ length: lead }, () => null), ...days];
  }, [days]);

  const weeks = React.useMemo(() => {
    const out: Array<Array<HeatDay | null>> = [];
    for (let i = 0; i < padded.length; i += 7) out.push(padded.slice(i, i + 7));
    return out;
  }, [padded]);

  const activeDays = days.filter((d) => d.minutes > 0);
  const total = days.reduce((s, d) => s + d.minutes, 0);

  return (
    <div className="viz-heat">
      <SectionHeader
        title="Study history"
        description={`${activeDays.length} active days · ${formatMinutes(total)} in the last 13 weeks`}
        actions={
          <SegmentedTabs
            ariaLabel="Heatmap view"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: 'Grid', icon: <LayoutGrid /> },
              { value: 'table', label: 'Table', icon: <Table2 /> },
            ]}
          />
        }
      />

      {view === 'table' ? (
        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <caption className="sr-only">Minutes studied per day, most recent first</caption>
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th scope="col" className="border-b border-line px-3 py-2 text-left font-medium">Date</th>
                <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">Studied</th>
                <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">vs target</th>
              </tr>
            </thead>
            <tbody>
              {[...activeDays].reverse().map((day) => (
                <tr key={day.date} className="border-b border-line last:border-0">
                  <td className="px-3 py-1.5">{formatDate(day.date, { weekday: 'short', year: 'numeric' })}</td>
                  <td className="tabular px-3 py-1.5 text-right">{formatMinutes(day.minutes)}</td>
                  <td className="tabular px-3 py-1.5 text-right text-ink-muted">
                    {Math.round((day.minutes / target) * 100)}%
                  </td>
                </tr>
              ))}
              {activeDays.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-ink-faint">
                    No study logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-4">
          {/*
            Scrolls from the right, so the most recent weeks are what you see
            first on a phone. A 13-week grid is about 250px wide, which fits a
            phone, but the fade signals the overflow when it does not.
          */}
          <div className="scroll-x pb-1">
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) => {
                    if (!day) return <div key={di} className="h-4 w-4" aria-hidden />;
                    const level = bucket(day.minutes);
                    const label = `${formatDate(day.date, { weekday: 'long', year: 'numeric' })}: ${
                      day.minutes > 0 ? formatMinutes(day.minutes) : 'no study'
                    }`;

                    return (
                      /*
                        Radix Tooltip replaces the hand-positioned hover card
                        this used to draw with `position: fixed` and raw
                        client-rect maths — which put the tooltip in the wrong
                        place as soon as the panel itself scrolled, and never
                        appeared at all on touch.
                      */
                      <Hint key={day.date} label={label}>
                        <div
                          tabIndex={0}
                          role="img"
                          aria-label={label}
                          className="h-4 w-4 rounded-[3px] outline-none transition-transform hover:scale-110 focus-visible:scale-110 focus-visible:ring-2 focus-visible:ring-accent/60"
                          style={{ backgroundColor: `var(--heat-${level})` }}
                        />
                      </Hint>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* legend */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-2xs text-ink-faint">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                key={level}
                aria-hidden
                className="h-3 w-3 rounded-[2px]"
                style={{ backgroundColor: `var(--heat-${level})` }}
              />
            ))}
            <span>More</span>
            <span className="ml-1.5">· target {formatMinutes(target)}/day</span>
          </div>
        </div>
      )}
    </div>
  );
}
