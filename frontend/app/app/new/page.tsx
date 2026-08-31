'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft, ArrowRight, Sparkles, Loader2, CalendarDays, Clock,
  GraduationCap, Briefcase, Layers, Check,
} from 'lucide-react';
import { Button, Card, Badge } from '../../../components/ui';
import { cn, formatMinutes } from '../../../lib/utils';

/* ------------------------------------------------------------------ types */

interface IntakeQuestion { id: string; q: string; opts: string[] }
interface Intake {
  pt: 'exam' | 'skill' | 'hybrid';
  sub: string;
  slug: string;
  lvl: string;
  conf: number;
  scope: string;
  ask: IntakeQuestion[];
}

const EXAMPLES = [
  'GATE ECE 2027',
  'AWS Solutions Architect Associate',
  'Become an ASIC design engineer',
  'Crack FAANG SDE interviews',
  'GRE quant 168+',
];

const LEVELS = [
  { value: 'beginner', label: 'Starting fresh', hint: 'Little or no exposure yet' },
  { value: 'intermediate', label: 'Some grounding', hint: 'Know the basics, gaps in depth' },
  { value: 'advanced', label: 'Experienced', hint: 'Working knowledge, chasing mastery' },
];

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const STEPS = ['Goal', 'You', 'Timeline', 'Capacity'];

const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
const addMonths = (months: number) => {
  const d = new Date();
  d.setMonth(d.getMonth() + months);
  return iso(d);
};

/* ------------------------------------------------------------------- page */

export default function NewPlanPage() {
  const router = useRouter();

  const [step, setStep] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);

  const [goal, setGoal] = React.useState('');
  const [intake, setIntake] = React.useState<Intake | null>(null);
  const [classifying, setClassifying] = React.useState(false);

  const [level, setLevel] = React.useState('beginner');
  const [answers, setAnswers] = React.useState<Record<string, string>>({});

  const [startDate, setStartDate] = React.useState(iso(new Date()));
  const [targetDate, setTargetDate] = React.useState(addMonths(3));

  const [weekdayMinutes, setWeekdayMinutes] = React.useState(120);
  const [weekendMinutes, setWeekendMinutes] = React.useState(240);
  const [restDays, setRestDays] = React.useState<number[]>([]);

  /* --------------------------------------------------------- derived */

  const weeks = Math.max(
    1,
    Math.round((new Date(targetDate).getTime() - new Date(startDate).getTime()) / (7 * 86_400_000)),
  );

  const totalMinutes = React.useMemo(() => {
    const rest = new Set(restDays);
    let total = 0;
    const days = Math.max(
      0,
      Math.round((new Date(targetDate).getTime() - new Date(startDate).getTime()) / 86_400_000),
    );
    for (let i = 0; i <= Math.min(days, 540); i++) {
      const dow = new Date(new Date(startDate).getTime() + i * 86_400_000).getDay();
      if (rest.has(dow)) continue;
      total += dow === 0 || dow === 6 ? weekendMinutes : weekdayMinutes;
    }
    return total;
  }, [startDate, targetDate, weekdayMinutes, weekendMinutes, restDays]);

  const hoursPerWeek = Math.round(((5 - restDays.filter((d) => d > 0 && d < 6).length) * weekdayMinutes +
    (2 - restDays.filter((d) => d === 0 || d === 6).length) * weekendMinutes) / 60);

  /* ----------------------------------------------------------- steps */

  const classify = async () => {
    if (goal.trim().length < 3) return;
    setClassifying(true);
    try {
      const response = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: goal.trim(), level, weeks, hoursPerWeek: hoursPerWeek || 14 }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? 'Could not read that goal');
      setIntake(body.data as Intake);
      setStep(1);
    } catch (error) {
      // Classification is a nicety, not a gate — let them proceed regardless.
      toast.error((error as Error).message);
      setIntake({
        pt: 'skill', sub: goal.trim(), slug: goal.trim().toLowerCase().replace(/\s+/g, '-'),
        lvl: level, conf: 0, scope: `Working competence in ${goal.trim()}`, ask: [],
      });
      setStep(1);
    } finally {
      setClassifying(false);
    }
  };

  const submit = async () => {
    if (!intake) return;
    setSubmitting(true);
    try {
      const response = await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: goal.trim(),
          level,
          startDate,
          targetDate,
          weekdayMinutes,
          weekendMinutes,
          restDays,
          intake: { ...intake, lvl: level },
          extras: answers,
        }),
      });
      const body = await response.json();
      if (!body.ok) throw new Error(body.error ?? 'Could not create the plan');
      router.push(`/plan/${body.data.id}/building`);
    } catch (error) {
      toast.error((error as Error).message);
      setSubmitting(false);
    }
  };

  const canAdvance =
    step === 0 ? goal.trim().length >= 3
    : step === 1 ? (intake?.ask ?? []).every((q) => answers[q.id])
    : step === 2 ? new Date(targetDate) > new Date(startDate)
    : weekdayMinutes > 0 || weekendMinutes > 0;

  /* ------------------------------------------------------------ render */

  return (
    <div className="mx-auto max-w-xl">
      <Link
        href="/app"
        className="mb-8 inline-flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to plans
      </Link>

      <StepRail step={step} />

      <div key={step} className="animate-in">
        {step === 0 && (
          <Step
            title="What are you preparing for?"
            sub="An exam, a certification, a role — anything with a finish line."
          >
            <textarea
              autoFocus
              rows={2}
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && canAdvance) { e.preventDefault(); classify(); }
              }}
              placeholder="e.g. GATE ECE 2027, or become an embedded systems engineer"
              className="w-full resize-none rounded-xl border border-line bg-surface-2 px-4 py-3.5 text-base outline-none transition-colors placeholder:text-ink-faint focus:border-accent/50"
            />

            <div className="mt-4">
              <p className="text-2xs font-medium uppercase tracking-wider text-ink-faint">Or try</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {EXAMPLES.map((example) => (
                  <button
                    key={example}
                    onClick={() => setGoal(example)}
                    className="rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-accent/40 hover:text-ink"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          </Step>
        )}

        {step === 1 && intake && (
          <Step title="A little about you" sub="This sets the depth and pace of the map.">
            <DetectedCard intake={intake} onChange={(pt) => setIntake({ ...intake, pt })} />

            <Field label="Where are you starting from?">
              <div className="grid gap-2">
                {LEVELS.map((option) => (
                  <Choice
                    key={option.value}
                    selected={level === option.value}
                    onClick={() => setLevel(option.value)}
                    title={option.label}
                    hint={option.hint}
                  />
                ))}
              </div>
            </Field>

            {intake.ask.map((question) => (
              <Field key={question.id} label={question.q}>
                <div className="grid gap-2 sm:grid-cols-2">
                  {question.opts.map((option) => (
                    <Choice
                      key={option}
                      selected={answers[question.id] === option}
                      onClick={() => setAnswers((a) => ({ ...a, [question.id]: option }))}
                      title={option}
                    />
                  ))}
                </div>
              </Field>
            ))}
          </Step>
        )}

        {step === 2 && (
          <Step title="When does this need to be done?" sub="The map is built backwards from this date.">
            <Field label="Target date">
              <div className="mb-3 flex flex-wrap gap-2">
                {[
                  { label: '1 month', months: 1 },
                  { label: '3 months', months: 3 },
                  { label: '6 months', months: 6 },
                  { label: '1 year', months: 12 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    onClick={() => setTargetDate(addMonths(preset.months))}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      targetDate === addMonths(preset.months)
                        ? 'border-accent bg-accent/12 text-accent'
                        : 'border-line bg-surface-2 text-ink-muted hover:text-ink',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              <div className="relative">
                <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
                <input
                  type="date"
                  value={targetDate}
                  min={startDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="h-12 w-full rounded-xl border border-line bg-surface-2 pl-10 pr-3 text-sm outline-none focus:border-accent/50"
                />
              </div>
            </Field>

            <Field label="Start date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-12 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm outline-none focus:border-accent/50"
              />
            </Field>

            {new Date(targetDate) <= new Date(startDate) && (
              <p className="text-sm text-danger">The target date has to be after the start date.</p>
            )}
          </Step>
        )}

        {step === 3 && (
          <Step title="How much time do you really have?" sub="Be honest — the plan is only useful if it fits.">
            <Stepper
              label="On a weekday"
              value={weekdayMinutes}
              onChange={setWeekdayMinutes}
              max={720}
            />
            <Stepper
              label="On a weekend day"
              value={weekendMinutes}
              onChange={setWeekendMinutes}
              max={720}
            />

            <Field label="Days off (optional)">
              <div className="flex gap-1.5">
                {DAY_LABELS.map((label, index) => {
                  const off = restDays.includes(index);
                  return (
                    <button
                      key={index}
                      onClick={() =>
                        setRestDays((days) =>
                          off ? days.filter((d) => d !== index) : [...days, index],
                        )
                      }
                      aria-pressed={off}
                      className={cn(
                        'h-10 flex-1 rounded-lg border text-sm font-medium transition-colors',
                        off
                          ? 'border-line bg-surface-3 text-ink-faint line-through'
                          : 'border-accent/30 bg-accent/10 text-accent',
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Card className="bg-surface-2 p-4">
              <div className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wider text-ink-faint">
                <Clock className="h-3.5 w-3.5" />
                Total study budget
              </div>
              <p className="tabular mt-2 font-display text-2xl font-semibold">
                {Math.round(totalMinutes / 60)} hours
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                across {weeks} weeks · about {formatMinutes(Math.round(totalMinutes / Math.max(1, weeks)))} per week
              </p>
              {totalMinutes < 900 && (
                <p className="mt-3 rounded-lg border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn">
                  That is a tight budget. APEX will prioritise the highest-value material and mark
                  the rest optional rather than pretend it all fits.
                </p>
              )}
            </Card>
          </Step>
        )}
      </div>

      {/* ---------------------------------------------------------- nav */}
      <div className="mt-8 flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className={cn(step === 0 && 'invisible')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {step === 0 ? (
          <Button onClick={classify} loading={classifying} disabled={!canAdvance} size="lg">
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : step < 3 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance} size="lg">
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <Button onClick={submit} loading={submitting} disabled={!canAdvance} size="lg">
            {submitting ? 'Creating…' : 'Build my prep map'}
            {!submitting && <Sparkles className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- fragments */

function StepRail({ step }: { step: number }) {
  return (
    <div className="mb-8 flex items-center gap-2">
      {STEPS.map((label, index) => (
        <React.Fragment key={label}>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-2xs font-semibold transition-colors',
                index < step ? 'bg-success/15 text-success'
                : index === step ? 'bg-accent text-accent-fg'
                : 'bg-surface-3 text-ink-faint',
              )}
            >
              {index < step ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
            </span>
            <span
              className={cn(
                'hidden text-xs font-medium sm:block',
                index === step ? 'text-ink' : 'text-ink-faint',
              )}
            >
              {label}
            </span>
          </div>
          {index < STEPS.length - 1 && (
            <div className={cn('h-px flex-1', index < step ? 'bg-success/40' : 'bg-line')} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink-muted">{sub}</p>
      <div className="mt-7 space-y-6">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

function Choice({
  selected, onClick, title, hint,
}: { selected: boolean; onClick: () => void; title: string; hint?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'rounded-xl border px-4 py-3 text-left transition-all',
        selected
          ? 'border-accent bg-accent/10 ring-1 ring-accent/20'
          : 'border-line bg-surface-2 hover:border-line-strong',
      )}
    >
      <span className={cn('block text-sm font-medium', selected && 'text-accent')}>{title}</span>
      {hint && <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>}
    </button>
  );
}

function DetectedCard({ intake, onChange }: { intake: Intake; onChange: (pt: Intake['pt']) => void }) {
  const types = [
    { value: 'exam' as const, label: 'Exam', icon: GraduationCap },
    { value: 'skill' as const, label: 'Skill / role', icon: Briefcase },
    { value: 'hybrid' as const, label: 'Cert + role', icon: Layers },
  ];

  return (
    <Card className="bg-surface-2 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge tone="accent">Detected</Badge>
          <p className="mt-2 truncate font-medium">{intake.sub}</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-muted">{intake.scope}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-1.5">
        {types.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            onClick={() => onChange(value)}
            className={cn(
              'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-medium transition-colors',
              intake.pt === value
                ? 'border-accent bg-accent/12 text-accent'
                : 'border-line text-ink-muted hover:text-ink',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>
    </Card>
  );
}

function Stepper({
  label, value, onChange, max,
}: { label: string; value: number; onChange: (v: number) => void; max: number }) {
  const presets = [30, 60, 90, 120, 180, 240, 300, 360];

  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={max}
          step={15}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-surface-3 accent-accent"
        />
        <span className="tabular w-20 shrink-0 text-right text-sm font-medium">
          {value === 0 ? 'None' : formatMinutes(value)}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset}
            onClick={() => onChange(preset)}
            className={cn(
              'rounded-md border px-2 py-1 text-2xs font-medium transition-colors',
              value === preset
                ? 'border-accent bg-accent/12 text-accent'
                : 'border-line text-ink-faint hover:text-ink',
            )}
          >
            {formatMinutes(preset)}
          </button>
        ))}
      </div>
    </Field>
  );
}
