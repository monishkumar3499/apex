'use client';

import * as React from 'react';
import { Table2, LayoutGrid } from 'lucide-react';
import { cn, formatMinutes, formatDate } from '../lib/utils';

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
  const [hover, setHover] = React.useState<{ day: HeatDay; x: number; y: number } | null>(null);

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
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold">Study history</h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            {activeDays.length} active days · {formatMinutes(total)} in the last 13 weeks
          </p>
        </div>

        <button
          onClick={() => setView((v) => (v === 'grid' ? 'table' : 'grid'))}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-2xs font-medium text-ink-muted transition-colors hover:text-ink"
        >
          {view === 'grid' ? <Table2 className="h-3.5 w-3.5" /> : <LayoutGrid className="h-3.5 w-3.5" />}
          {view === 'grid' ? 'Table view' : 'Grid view'}
        </button>
      </div>

      {view === 'table' ? (
        <div className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-line">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2">
              <tr>
                <th className="border-b border-line px-3 py-2 text-left font-medium">Date</th>
                <th className="border-b border-line px-3 py-2 text-right font-medium">Studied</th>
                <th className="border-b border-line px-3 py-2 text-right font-medium">vs target</th>
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
        <div className="relative mt-4">
          <div className="overflow-x-auto pb-1">
            <div className="flex gap-[3px]">
              {weeks.map((week, wi) => (
                <div key={wi} className="flex flex-col gap-[3px]">
                  {week.map((day, di) => {
                    if (!day) return <div key={di} className="h-4 w-4" />;
                    const level = bucket(day.minutes);
                    return (
                      <div
                        key={day.date}
                        tabIndex={0}
                        role="img"
                        aria-label={`${formatDate(day.date, { weekday: 'long', year: 'numeric' })}: ${
                          day.minutes > 0 ? formatMinutes(day.minutes) : 'no study'
                        }`}
                        onMouseEnter={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHover({ day, x: rect.left + rect.width / 2, y: rect.top });
                        }}
                        onMouseLeave={() => setHover(null)}
                        onFocus={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setHover({ day, x: rect.left + rect.width / 2, y: rect.top });
                        }}
                        onBlur={() => setHover(null)}
                        className="h-4 w-4 rounded-[3px] transition-transform hover:scale-110 focus:scale-110"
                        style={{ backgroundColor: `var(--heat-${level})` }}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* legend */}
          <div className="mt-3 flex items-center gap-1.5 text-2xs text-ink-faint">
            <span>Less</span>
            {[0, 1, 2, 3, 4].map((level) => (
              <span
                key={level}
                className="h-3 w-3 rounded-[2px]"
                style={{ backgroundColor: `var(--heat-${level})` }}
              />
            ))}
            <span>More</span>
            <span className="ml-2">· target {formatMinutes(target)}/day</span>
          </div>

          {hover && (
            <div
              className="surface-raised pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg px-2.5 py-1.5 text-2xs shadow-lg"
              style={{ left: hover.x, top: hover.y - 8 }}
            >
              <span className="font-medium">
                {hover.day.minutes > 0 ? formatMinutes(hover.day.minutes) : 'No study'}
              </span>
              <span className="ml-1.5 text-ink-faint">
                {formatDate(hover.day.date, { weekday: 'short' })}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
