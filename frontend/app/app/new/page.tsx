'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft, ArrowRight, Sparkles, CalendarDays, GraduationCap,
  Briefcase, Layers, Check, Target, Gauge, AlertTriangle,
} from 'lucide-react';
import {
  Button, Card, Badge, Textarea, Input, FormField, Slider,
  Segmented, SegmentedMulti, Callout, EASE,
} from '../../../components/ui';
import { InsightStream } from '../../../components/insight-stream';
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

const DAYS = [
  { value: '0', label: 'S' }, { value: '1', label: 'M' }, { value: '2', label: 'T' },
  { value: '3', label: 'W' }, { value: '4', label: 'T' }, { value: '5', label: 'F' },
  { value: '6', label: 'S' },
];

const STEPS = [
  { label: 'Goal', hint: 'What you are preparing for' },
  { label: 'You', hint: 'Where you are starting from' },
  { label: 'Timeline', hint: 'When it needs to be done' },
  { label: 'Capacity', hint: 'The hours you actually have' },
];

const DURATIONS = [
  { value: '1', label: '1 month' },
  { value: '3', label: '3 months' },
  { value: '6', label: '6 months' },
  { value: '12', label: '1 year' },
];

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
  const [direction, setDirection] = React.useState(1);
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

  const datesValid = new Date(targetDate) > new Date(startDate);

  /* ----------------------------------------------------------- steps */

  const go = (next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  };

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
      go(1);
    } catch (error) {
      // Classification is a nicety, not a gate — let them proceed regardless.
      toast.error((error as Error).message);
      setIntake({
        pt: 'skill', sub: goal.trim(), slug: goal.trim().toLowerCase().replace(/\s+/g, '-'),
        lvl: level, conf: 0, scope: `Working competence in ${goal.trim()}`, ask: [],
      });
      go(1);
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
    : step === 2 ? datesValid
    : weekdayMinutes > 0 || weekendMinutes > 0;

  const busy = classifying || submitting;

  /* ------------------------------------------------------------ render */

  return (
    <div className="mx-auto w-full max-w-xl">
      <Link
        href="/app"
        className="inline-flex min-h-touch items-center gap-1.5 rounded-lg text-sm text-ink-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/60"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to plans
      </Link>

      <StepRail step={step} onJump={go} />

      {/*
        The panel is height-animated between steps rather than swapped. Each
        step is a different height, and without this the sticky footer jumps up
        or down the moment you press Continue — which reads as a layout bug
        rather than as a transition.
      */}
      <div className="relative overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={direction}>
          <motion.div
            key={step}
            custom={direction}
            initial={{ opacity: 0, x: direction * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -24 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            {step === 0 && (
              <Step
                title="What are you preparing for?"
                sub="An exam, a certification, a role — anything with a finish line."
              >
                <FormField label="Your goal" htmlFor="goal">
                  <Textarea
                    id="goal"
                    autoFocus
                    rows={2}
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && canAdvance) {
                        e.preventDefault();
                        void classify();
                      }
                    }}
                    placeholder="e.g. GATE ECE 2027, or become an embedded systems engineer"
                  />
                </FormField>

                <div>
                  <p className="text-2xs font-medium uppercase tracking-wider text-ink-faint">Or try</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {EXAMPLES.map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setGoal(example)}
                        className={cn(
                          'min-h-touch rounded-field border px-3 py-2 text-xs outline-none transition-colors',
                          'focus-visible:ring-2 focus-visible:ring-accent/60',
                          goal === example
                            ? 'border-accent/50 bg-accent/12 text-accent'
                            : 'border-line bg-surface-2 text-ink-muted hover:border-line-strong hover:text-ink',
                        )}
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

                <FormField label="Where are you starting from?">
                  <div className="grid grid-cols-1 gap-2">
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
                </FormField>

                {intake.ask.map((question) => (
                  <FormField key={question.id} label={question.q}>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {question.opts.map((option) => (
                        <Choice
                          key={option}
                          selected={answers[question.id] === option}
                          onClick={() => setAnswers((a) => ({ ...a, [question.id]: option }))}
                          title={option}
                        />
                      ))}
                    </div>
                  </FormField>
                ))}
              </Step>
            )}

            {step === 2 && (
              <Step title="When does this need to be done?" sub="The map is built backwards from this date.">
                <FormField
                  label="Target date"
                  htmlFor="target-date"
                  error={datesValid ? null : 'The target date has to be after the start date.'}
                >
                  <Segmented
                    ariaLabel="Timeline presets"
                    className="mb-3"
                    value={DURATIONS.find((d) => addMonths(Number(d.value)) === targetDate)?.value ?? ''}
                    onChange={(months) => setTargetDate(addMonths(Number(months)))}
                    options={DURATIONS}
                  />

                  <div className="relative">
                    <CalendarDays
                      aria-hidden
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                    />
                    <Input
                      id="target-date"
                      type="date"
                      value={targetDate}
                      min={startDate}
                      invalid={!datesValid}
                      onChange={(e) => setTargetDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </FormField>

                <FormField label="Start date" htmlFor="start-date">
                  <div className="relative">
                    <CalendarDays
                      aria-hidden
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
                    />
                    <Input
                      id="start-date"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </FormField>

                {datesValid && (
                  <Callout tone="info" icon={<Target />} title={`${weeks} weeks to prepare`}>
                    Everything — units, review, checkpoints and mocks — is laid out inside that window.
                  </Callout>
                )}
              </Step>
            )}

            {step === 3 && (
              <Step
                title="How much time do you really have?"
                sub="Be honest. The plan is only useful if it fits."
              >
                <MinutesField
                  id="weekday-minutes"
                  label="On a weekday"
                  value={weekdayMinutes}
                  onChange={setWeekdayMinutes}
                />
                <MinutesField
                  id="weekend-minutes"
                  label="On a weekend day"
                  value={weekendMinutes}
                  onChange={setWeekendMinutes}
                />

                <FormField label="Days off (optional)" hint="Tap a day to take it out of the schedule entirely.">
                  <SegmentedMulti
                    equal
                    ariaLabel="Rest days"
                    value={restDays.map(String)}
                    onChange={(values) => setRestDays(values.map(Number))}
                    options={DAYS.map((d) => ({
                      ...d,
                      label: (
                        <span className={cn(restDays.includes(Number(d.value)) && 'line-through opacity-70')}>
                          {d.label}
                        </span>
                      ),
                    }))}
                  />
                </FormField>

                <BudgetSummary
                  totalMinutes={totalMinutes}
                  weeks={weeks}
                  restDayCount={restDays.length}
                />
              </Step>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/*
        The two model-backed steps are the only ones with a real wait. Reading
        material during them turns a few dead seconds into something useful,
        and the same component covers the much longer wait on the build screen.
      */}
      <AnimatePresence>
        {busy && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <InsightStream compact className="mt-6" categories={['learning', 'focus']} intervalMs={5_000} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ---------------------------------------------------------- nav */}
      {/*
        Sticky on mobile: the capacity step is tall enough to push "Build my
        prep map" below the fold on a phone, and a primary action a learner
        has to hunt for reads as a dead end.
      */}
      <div
        className={cn(
          'mt-8 flex items-center justify-between gap-3',
          'sticky bottom-0 -mx-4 border-t border-line bg-bg/95 px-4 py-3 pb-safe backdrop-blur-xl',
          'sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none',
        )}
      >
        <Button
          variant="ghost"
          onClick={() => go(Math.max(0, step - 1))}
          disabled={busy}
          className={cn(step === 0 && 'invisible')}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>

        {step === 0 ? (
          <Button onClick={classify} loading={classifying} disabled={!canAdvance} size="lg">
            {classifying ? 'Reading your goal…' : 'Continue'}
            {!classifying && <ArrowRight className="h-4 w-4" />}
          </Button>
        ) : step < 3 ? (
          <Button onClick={() => go(step + 1)} disabled={!canAdvance} size="lg">
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

/**
 * The step rail.
 *
 * A spine, like every other ordered thing in APEX — but horizontal, because
 * these four steps are a short linear run rather than a long schedule.
 *
 * Completed steps are clickable so a learner can go back and change an answer
 * without walking backwards through every screen; steps ahead are not, because
 * they may not have loaded their questions yet.
 */
function StepRail({ step, onJump }: { step: number; onJump: (next: number) => void }) {
  return (
    <nav aria-label="Setup progress" className="my-7 sm:my-8">
      <ol className="flex items-center gap-1.5 sm:gap-2">
        {STEPS.map((entry, index) => {
          const state = index < step ? 'done' : index === step ? 'active' : 'pending';
          const reachable = index < step;

          return (
            <React.Fragment key={entry.label}>
              <li className="flex min-w-0 items-center gap-2">
                <button
                  type="button"
                  disabled={!reachable}
                  onClick={() => reachable && onJump(index)}
                  aria-current={state === 'active' ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-full outline-none transition-colors',
                    'focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                    reachable && 'cursor-pointer',
                    !reachable && 'cursor-default',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-2xs font-semibold transition-colors',
                      state === 'done' && 'bg-success/15 text-success',
                      state === 'active' && 'bg-accent text-accent-fg',
                      state === 'pending' && 'bg-surface-3 text-ink-faint',
                    )}
                  >
                    {state === 'done' ? <Check className="h-3 w-3" strokeWidth={3} /> : index + 1}
                  </span>
                  {/*
                    Only the current step's label shows on a phone. Four labels
                    at once wrap onto two lines and squash the rail; the active
                    one is the only label that answers "where am I".
                  */}
                  <span
                    className={cn(
                      'truncate text-xs font-medium transition-colors',
                      state === 'active' ? 'text-ink' : 'text-ink-faint',
                      state === 'active' ? 'inline' : 'hidden sm:inline',
                    )}
                  >
                    {entry.label}
                  </span>
                </button>
              </li>

              {index < STEPS.length - 1 && (
                <li aria-hidden className="h-px min-w-2 flex-1 overflow-hidden rounded-full bg-line">
                  <motion.span
                    className="block h-full bg-success/50"
                    initial={false}
                    animate={{ scaleX: index < step ? 1 : 0 }}
                    style={{ transformOrigin: 'left' }}
                    transition={{ duration: 0.4, ease: EASE }}
                  />
                </li>
              )}
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}

function Step({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="pb-1">
      <h1 className="font-display text-fluid-h3 font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">{sub}</p>
      <div className="mt-7 space-y-6">{children}</div>
    </div>
  );
}

function Choice({
  selected, onClick, title, hint,
}: { selected: boolean; onClick: () => void; title: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'relative rounded-xl border px-4 py-3 text-left outline-none transition-all duration-150',
        'focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        selected
          ? 'border-accent bg-accent/10 ring-1 ring-accent/20'
          : 'border-line bg-surface-2 hover:border-line-strong',
      )}
    >
      <span className="flex items-center justify-between gap-3">
        <span className={cn('block text-sm font-medium', selected && 'text-accent')}>{title}</span>
        {selected && <Check className="h-4 w-4 shrink-0 text-accent" strokeWidth={3} />}
      </span>
      {hint && <span className="mt-0.5 block text-xs text-ink-muted">{hint}</span>}
    </button>
  );
}

function DetectedCard({ intake, onChange }: { intake: Intake; onChange: (pt: Intake['pt']) => void }) {
  const types = [
    { value: 'exam' as const, label: 'Exam', icon: <GraduationCap /> },
    { value: 'skill' as const, label: 'Skill / role', icon: <Briefcase /> },
    { value: 'hybrid' as const, label: 'Cert + role', icon: <Layers /> },
  ];

  return (
    <Card className="bg-surface-2 p-4">
      <Badge tone="accent">
        <Sparkles />
        Detected
      </Badge>
      <p className="mt-2.5 font-medium leading-snug">{intake.sub}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-muted">{intake.scope}</p>

      <div className="mt-4">
        <p className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink-faint">
          Not quite right? Change it
        </p>
        <Segmented
          ariaLabel="Preparation type"
          value={intake.pt}
          onChange={onChange}
          options={types}
          className="[&>*]:flex-1"
        />
      </div>
    </Card>
  );
}

/**
 * Minutes per day.
 *
 * A slider gives the coarse shape of the answer and the presets give the exact
 * one — a learner who knows they have exactly 90 minutes should not have to
 * land a slider thumb on it.
 */
function MinutesField({
  id, label, value, onChange,
}: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  const presets = [30, 60, 90, 120, 180, 240, 300, 360];

  return (
    <FormField
      label={label}
      htmlFor={id}
      labelAction={
        <span className="tabular text-sm font-semibold text-accent">
          {value === 0 ? 'None' : formatMinutes(value)}
        </span>
      }
    >
      <Slider
        id={id}
        min={0}
        max={720}
        step={15}
        value={[value]}
        onValueChange={([next]) => onChange(next)}
        aria-label={label}
      />

      {/*
        The row scrolls on a phone and wraps once there is room. The edge fade
        only applies while it scrolls — a chip clipped flat at the edge reads as
        a rendering fault, whereas a faded one reads as "there is more" — and is
        removed at `sm`, where a fade over a wrapped row would just dim the last
        chip for no reason.
      */}
      <div className="scroll-x scroll-fade-x mt-2 -mx-1 flex gap-1.5 px-1 pb-1 sm:flex-wrap sm:overflow-visible sm:[mask-image:none]">
        {presets.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(preset)}
            aria-pressed={value === preset}
            className={cn(
              'min-h-touch shrink-0 rounded-field border px-2.5 text-2xs font-medium outline-none transition-colors',
              'focus-visible:ring-2 focus-visible:ring-accent/60',
              value === preset
                ? 'border-accent/50 bg-accent/12 text-accent'
                : 'border-line text-ink-faint hover:border-line-strong hover:text-ink',
            )}
          >
            {formatMinutes(preset)}
          </button>
        ))}
      </div>
    </FormField>
  );
}

/**
 * The live budget.
 *
 * This is the one number that decides whether the plan will be any good, so it
 * updates as the learner moves the sliders rather than waiting until the build
 * to tell them the timeline never fitted.
 */
function BudgetSummary({
  totalMinutes, weeks, restDayCount,
}: { totalMinutes: number; weeks: number; restDayCount: number }) {
  const hours = Math.round(totalMinutes / 60);
  const perWeek = Math.round(totalMinutes / Math.max(1, weeks));
  const tight = totalMinutes < 900;

  return (
    <Card className="overflow-hidden bg-surface-2">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-ink-faint">
        <Gauge className="h-3.5 w-3.5" />
        Total study budget
      </div>

      <div className="p-4">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <motion.p
            key={hours}
            initial={{ opacity: 0.5, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="tabular font-display text-3xl font-semibold tracking-tight"
          >
            {hours}
            <span className="ml-1 text-base font-medium text-ink-muted">hours</span>
          </motion.p>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
          <div>
            <dt className="text-ink-faint">Over</dt>
            <dd className="tabular mt-0.5 font-medium">{weeks} weeks</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Per week</dt>
            <dd className="tabular mt-0.5 font-medium">{formatMinutes(perWeek)}</dd>
          </div>
          <div>
            <dt className="text-ink-faint">Rest days</dt>
            <dd className="tabular mt-0.5 font-medium">
              {restDayCount === 0 ? 'None' : `${restDayCount}/week`}
            </dd>
          </div>
        </dl>

        {tight && (
          <Callout tone="warn" icon={<AlertTriangle />} className="mt-4">
            That is a tight budget. APEX will prioritise the highest-value material and mark the rest
            optional rather than pretend it all fits.
          </Callout>
        )}
      </div>
    </Card>
  );
}
