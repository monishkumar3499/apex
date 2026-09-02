'use client';

import * as React from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Check, Loader2, AlertTriangle, Compass, RefreshCw, ArrowLeft, ShieldCheck,
} from 'lucide-react';
import { Button, Card, Progress } from '../../../../components/ui';
import { InsightStream } from '../../../../components/insight-stream';
import { cn } from '../../../../lib/utils';

/** Stages in the order the pipeline emits them. */
const STAGES = [
  { key: 'structure', label: 'Designing the syllabus', hint: 'Mapping units and topics to your level and timeline' },
  { key: 'topics', label: 'Structuring topics', hint: 'Estimating study time and prerequisite order' },
  { key: 'resources', label: 'Finding real material', hint: 'Ranking lectures and docs on engagement and authority' },
  { key: 'schedule', label: 'Laying out your days', hint: 'Fitting the work to the hours you actually have' },
  { key: 'ready', label: 'Finishing up', hint: 'Spaced review, checkpoints and mocks placed' },
];

interface StageEvent {
  id: number;
  stage: string;
  status: string;
  message: string;
  meta: Record<string, unknown>;
}

export default function BuildingPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const planId = params.id;

  const [events, setEvents] = React.useState<StageEvent[]>([]);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [retrying, setRetrying] = React.useState(false);
  const [elapsed, setElapsed] = React.useState(0);

  // An honest elapsed counter beats a fake progress estimate: it never
  // overshoots, and it tells the learner the build is still moving.
  React.useEffect(() => {
    const tick = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(tick);
  }, []);

  React.useEffect(() => {
    const source = new EventSource(`/api/plans/${planId}/events`);

    source.addEventListener('stage', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as StageEvent;
      setEvents((current) => (current.some((e) => e.id === data.id) ? current : [...current, data]));
    });

    source.addEventListener('done', (event) => {
      const data = JSON.parse((event as MessageEvent).data) as { status: string; error?: string };
      source.close();

      if (data.status === 'ready') {
        // Small beat so the last stage visibly lands before navigating.
        setTimeout(() => router.replace(`/plan/${planId}/today`), 700);
      } else if (data.status === 'timeout') {
        setFailed('The build is taking longer than expected. It may still finish — reload to check.');
      } else {
        setFailed(data.error ?? 'The build stopped unexpectedly.');
      }
    });

    source.onerror = () => source.close();
    return () => source.close();
  }, [planId, router]);

  const stageState = (key: string): 'done' | 'active' | 'pending' | 'error' => {
    const matching = events.filter((e) => e.stage === key);
    if (matching.some((e) => e.status === 'error')) return 'error';
    if (matching.some((e) => e.status === 'ok')) return 'done';
    if (matching.length) return 'active';
    return 'pending';
  };

  const doneCount = STAGES.filter((s) => stageState(s.key) === 'done').length;
  const firstPending = STAGES.findIndex((s) => stageState(s.key) !== 'done');
  const latest = events[events.length - 1];

  const retry = async () => {
    setRetrying(true);
    try {
      await fetch(`/api/plans/${planId}`, { method: 'POST' });
      window.location.reload();
    } catch {
      setRetrying(false);
    }
  };

  if (failed) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-4 py-16 sm:px-5">
        <Card raised className="w-full max-w-md rounded-panel p-6 text-center animate-in sm:p-8">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-danger/12 text-danger">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="font-display text-lg font-semibold sm:text-xl">The build did not finish</h1>
          <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{failed}</p>
          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            This is usually a busy model endpoint. APEX tries several models before giving up, so a
            retry almost always works.
          </p>

          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-center">
            <Link href="/app" className="sm:w-auto">
              <Button variant="ghost" className="w-full sm:w-auto">
                <ArrowLeft className="h-4 w-4" />
                All plans
              </Button>
            </Link>
            <Button onClick={retry} loading={retrying} className="w-full sm:w-auto">
              <RefreshCw className="h-4 w-4" />
              Try again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12 sm:px-5 sm:py-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[500px] bg-[radial-gradient(55%_70%_at_50%_0%,rgb(var(--accent)/0.10),transparent_72%)]"
      />

      <div className="relative w-full max-w-lg animate-in">
        <div className="text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-fg animate-pulse-ring">
            <Compass className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h1 className="mt-6 font-display text-xl font-semibold tracking-tight sm:text-2xl">
            Building your prep map
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-muted">
            Usually under a minute. You can close this tab — it keeps building.
          </p>
        </div>

        <div className="mt-7">
          <Progress value={(doneCount / STAGES.length) * 100} />
          <div className="mt-2 flex items-center justify-between text-2xs text-ink-faint">
            <span>
              {doneCount} of {STAGES.length} stages
            </span>
            <span className="tabular">{formatElapsed(elapsed)}</span>
          </div>
        </div>

        <Card raised className="mt-5 rounded-panel p-4 sm:p-6">
          <ol className="space-y-1">
            {STAGES.map((stage, index) => {
              const state = index === firstPending && events.length > 0 ? 'active' : stageState(stage.key);
              const event = [...events].reverse().find((e) => e.stage === stage.key);

              return (
                <li
                  key={stage.key}
                  className={cn(
                    'flex gap-3 rounded-lg px-2.5 py-2.5 transition-colors sm:px-3',
                    state === 'active' && 'bg-accent/[0.07]',
                  )}
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                    {state === 'done' ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
                        <Check className="h-3 w-3" strokeWidth={3} />
                      </span>
                    ) : state === 'active' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-accent" />
                    ) : state === 'error' ? (
                      <AlertTriangle className="h-4 w-4 text-danger" />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'text-sm transition-colors',
                        state === 'pending' ? 'text-ink-faint' : 'font-medium text-ink',
                      )}
                    >
                      {stage.label}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                      {event?.message ?? stage.hint}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>

          {latest?.meta && Object.keys(latest.meta).length > 0 && <BuildStats meta={latest.meta} />}
        </Card>

        {/* The wait, made worth having. */}
        <InsightStream className="mt-5" />

        <p className="mt-4 flex items-start justify-center gap-1.5 px-2 text-center text-2xs leading-relaxed text-ink-faint">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0" />
          <span>
            Every resource comes from a live API and is ranked on real watch data — no link in your
            plan was written by a model.
          </span>
        </p>
      </div>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** Surfaces the concrete numbers as each stage reports them. */
function BuildStats({ meta }: { meta: Record<string, unknown> }) {
  const fields: Array<[string, string]> = [];
  const num = (key: string) => (typeof meta[key] === 'number' ? (meta[key] as number) : null);

  const found = num('found');
  const studyDays = num('studyDays');
  const itemCount = num('itemCount');
  const utilisation = num('utilisation');

  if (found !== null) fields.push(['Resources', String(found)]);
  if (studyDays !== null) fields.push(['Study days', String(studyDays)]);
  if (itemCount !== null) fields.push(['Scheduled items', String(itemCount)]);
  if (utilisation !== null) fields.push(['Capacity used', `${Math.round(utilisation * 100)}%`]);

  if (!fields.length) return null;

  return (
    <div className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-5 sm:grid-cols-4">
      {fields.map(([label, value]) => (
        <div key={label}>
          <p className="tabular font-display text-lg font-semibold">{value}</p>
          <p className="text-2xs uppercase tracking-wider text-ink-faint">{label}</p>
        </div>
      ))}
    </div>
  );
}
