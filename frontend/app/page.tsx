import Link from 'next/link';
import {
  ArrowRight, CalendarDays, Library, Brain, LineChart, Sparkles,
  ShieldCheck, Repeat, Layers, Timer, Check, MessageSquare, Cpu, Code2,
  CalendarClock, Lock, Gauge, Zap,
} from 'lucide-react';
import { LandingNav } from '../components/landing-nav';
import { cn } from '../lib/utils';
import {
  Badge, Button, FadeIn, KairoLogo, OrbitField, OrbitRings,
  Spine, SpineNode, Tilt, Void,
} from '../components/ui';

const SURFACES = [
  {
    icon: CalendarDays,
    name: 'Today',
    line: 'One screen that answers "what do I study right now" — with the resource already open.',
  },
  {
    icon: Layers,
    name: 'Map',
    line: 'Every day from now to your deadline, laid out. Units, topics, checkpoints, mocks.',
  },
  {
    icon: Library,
    name: 'Library',
    line: 'Real lectures, docs and papers — ranked by watch data, never invented by a model.',
  },
  {
    icon: Brain,
    name: 'Drill',
    line: 'Spaced-repetition questions generated from your own topics, scheduled by SM-2.',
  },
  {
    icon: LineChart,
    name: 'Progress',
    line: 'Streaks, mastery per topic, and an honest read on whether you will finish in time.',
  },
  {
    icon: MessageSquare,
    name: 'Coach',
    line: 'Knows your whole plan and where you are in it. Ask it to explain, unstick you, or tell you honestly whether you are on track.',
  },
];

const PRINCIPLES = [
  {
    icon: Timer,
    title: 'It respects the hours you actually have',
    body: 'You give it weekday and weekend minutes. No day is ever scheduled past its capacity, so the plan stays followable instead of aspirational.',
  },
  {
    icon: Repeat,
    title: 'Everything comes back',
    body: 'Each topic returns at 2, 7 and 21 days, with unit checkpoints and full mocks spaced through the timeline. Learning once is not learning.',
  },
  {
    icon: ShieldCheck,
    title: 'Every link is real',
    body: 'Resources are fetched from live APIs and ranked on duration, engagement and authority. A language model never writes a URL.',
  },
  {
    icon: Sparkles,
    title: 'It bends when you slip',
    body: 'Fall behind and one tap re-cuts the remaining days around what is left, without moving your deadline or breaking your stated capacity. See the reschedule engine above.',
  },
];

const STEPS = [
  {
    n: '01',
    t: 'Name the goal',
    d: 'GATE ECE, AWS Solutions Architect, or "become an ML engineer". Kairo works out whether it is an exam or a role and asks the one or two follow-ups that actually change the plan.',
  },
  {
    n: '02',
    t: 'Give it your real constraints',
    d: 'Deadline, weekday minutes, weekend minutes, rest days. It plans against what you have, not against an idealised eight-hour day.',
  },
  {
    n: '03',
    t: 'Follow Today, every day',
    d: 'Open the app, do what it says, tick it off. Review, checkpoints and mocks are already placed. When you slip, it re-cuts the schedule.',
  },
];

/**
 * The division of labour, which is the product's actual thesis.
 *
 * Two columns rather than the README's six-row table: on a phone a table of
 * that shape either scrolls sideways or collapses into unreadable stacks, and
 * the point being made is binary anyway — judgement goes to the model,
 * arithmetic goes to code.
 */
const JUDGEMENT = [
  { job: 'Classify the goal', why: 'Is "AWS SAA" an exam or a role?' },
  { job: 'Design units and topics', why: 'What does this subject actually contain?' },
  { job: 'Write drill questions', why: 'Lazily, per topic you actually study.' },
];

const ARITHMETIC = [
  { job: 'Find and rank resources', why: 'APIs know view counts and durations. Models invent URLs.' },
  { job: 'Build the schedule', why: 'Fitting work into capacity is arithmetic, not prose.' },
  { job: 'Write the plan digest', why: 'It is a projection of data we already hold.' },
];

/**
 * What the replan pass actually guarantees.
 *
 * Every line here is a property of `replan()` in `backend/services/
 * plan-service.ts`, not a marketing claim — including the 25% overflow, which
 * is the one design decision in it that a learner can feel.
 */
const RESCHEDULE = [
  {
    icon: Lock,
    title: 'Your deadline does not move',
    body: 'The exam is on the date the exam is on. Re-cutting the plan means fitting what is left into the days that are left — never quietly extending the finish line to make the arithmetic work.',
  },
  {
    icon: Gauge,
    title: 'Your capacity is still respected',
    body: 'Overdue work is re-laid against the same weekday and weekend minutes you gave us. No day silently becomes a four-hour day because you missed a Tuesday.',
  },
  {
    icon: Layers,
    title: 'Catch-up is dense, not smeared',
    body: 'A day accepts up to 25% over its capacity before the overflow spills to the next one. Spreading two missed hours evenly across four months is how a plan quietly becomes 1% harder forever, which nobody notices and nobody recovers from.',
  },
  {
    icon: Zap,
    title: 'It costs nothing and takes no thought',
    body: 'No model call, no tokens, no waiting. It is arithmetic over rows you already have, so it runs in the time it takes to tap the button — and you can run it as often as life requires.',
  },
];

const MEASURED = [
  { value: '80', unit: 'topics', label: 'across 12 units' },
  { value: '26', unit: 'seconds', label: 'to build a 26-week plan' },
  { value: '15k', unit: 'tokens', label: 'for the whole build' },
  { value: '2/7/21', unit: 'days', label: 'every topic returns' },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <LandingNav />

      <main id="main">
        {/* --------------------------------------------------------- hero */}
        <section className="relative px-4 pb-16 pt-10 sm:px-6 sm:pb-24 sm:pt-16 lg:px-8 lg:pb-32 lg:pt-24">
          <Void variant="hero" grid />

          {/*
            The orbit field is the one place on the site that gets the full
            canvas treatment.

            It is anchored to the *right* on wide screens rather than centred,
            and that is a legibility fix rather than a compositional whim:
            centred over the whole hero, its glowing nodes land on top of the
            headline at some viewport widths and not others. Behind the preview
            card it reinforces the one element it belongs to, and the text
            column stays clean.

            Clipped to the hero, so it never competes with anything further down
            and stops animating the moment it scrolls out of view.
          */}
          <div
            aria-hidden
            /*
              Three placements, because the hero has three layouts.

              Below `lg` the copy is a single full-width column, so there is
              nowhere for the field to go that is not behind text — it is
              pulled up above the headline and dimmed instead. The `sm`–`lg`
              band is dimmed hardest: that is where the paragraph and the CTA
              row are widest, and a node landing on "…and by when" reads as a
              rendering fault rather than as depth.
            */
            className="pointer-events-none absolute -top-[10%] left-1/2 aspect-square w-[min(760px,135%)] -translate-x-1/2 opacity-50 sm:-top-[24%] sm:opacity-40 lg:left-auto lg:right-[-6%] lg:top-[-14%] lg:w-[46rem] lg:translate-x-0 lg:opacity-80"
          >
            <OrbitField intensity={0.85} scale={0.82} density="full" className="hidden sm:block" />
            {/* Lighter system on phones: a third of the area, so the fourth ring
                would be invisible and the nodes would overlap. */}
            <OrbitField intensity={0.55} scale={0.9} density="lite" className="sm:hidden" />
          </div>

          <div className="relative mx-auto w-full max-w-content">
            {/*
              The preview leads on a phone — it is the clearest single
              explanation of what the product is — and moves beside the copy
              once the viewport is wide enough to hold both.

              `minmax(0, …fr)` rather than a bare `…fr`: an `fr` track keeps an
              automatic min-content floor, so one long unbreakable string in the
              headline would push the column — and the page — wider than the
              viewport.
            */}
            <div className="grid w-full min-w-0 grid-cols-1 items-center gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(0,0.98fr)] lg:gap-14 xl:gap-20">
              <FadeIn className="w-full min-w-0">
                <Badge tone="accent" className="mb-6">
                  <Sparkles />
                  AI prep engine
                </Badge>

                <h1 className="font-display text-fluid-hero font-semibold">
                  Stop collecting resources.{' '}
                  {/*
                    The one iridescent phrase on the page. `.holo` animates a
                    gradient through the glyphs; using it twice would make
                    neither line the emphasis.
                  */}
                  <span className="holo sm:block">Start following a plan.</span>
                </h1>

                <p className="mt-6 max-w-lg text-base leading-relaxed text-ink-muted lg:text-lg">
                  Tell Kairo what you are preparing for and by when. It finds the best material that
                  actually exists, then maps every day between now and your deadline around the
                  hours you really have.
                </p>

                <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:gap-3">
                  <Button asChild size="lg">
                    <Link href="/app/new">
                      Build my prep map
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <a href="#how">See how it works</a>
                  </Button>
                </div>

                <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted sm:gap-x-6 sm:text-sm">
                  {['Exams and career prep', 'Real, verified resources', 'Free to start'].map((line) => (
                    <li key={line} className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 shrink-0 text-cyan" strokeWidth={2.5} aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </FadeIn>

              <FadeIn delay={0.14} className="w-full min-w-0">
                <PrepMapPreview />
              </FadeIn>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- measured */}
        <section
          aria-label="Measured performance"
          className="relative border-y border-glass-edge/[0.06] px-4 py-10 sm:px-6 sm:py-12 lg:px-8"
        >
          <div className="mx-auto grid max-w-content grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-4">
            {MEASURED.map((stat, i) => (
              <FadeIn key={stat.label} delay={i * 0.06} className="text-center md:text-left">
                <div className="flex items-baseline justify-center gap-1.5 md:justify-start">
                  <span className="font-mono text-fluid-stat font-semibold tracking-tight text-ink">
                    {stat.value}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-widest text-accent">
                    {stat.unit}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-ink-muted sm:text-sm">{stat.label}</p>
              </FadeIn>
            ))}
          </div>
        </section>

        {/* ----------------------------------------------------- how it works */}
        <section id="how" className="relative px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <Void variant="ambient" />

          <div className="relative mx-auto max-w-content">
            <SectionHead
              eyebrow="How it works"
              title="Three answers, then a plan you can actually run"
              sub="Setup takes about a minute. Building the map takes about two."
            />

            {/*
              The steps sit on the orbit rail — the same graphic the app uses on
              Today and on the build screen. A marketing page drawn from bespoke
              parts that resemble nothing in the product is how a landing page
              ends up over-promising.
            */}
            <Spine
              x="1.125rem"
              inset={{ top: '1.75rem', bottom: '1.75rem' }}
              className="mt-12 sm:mt-16 md:hidden"
            >
              <ol className="space-y-8">
                {STEPS.map((step, i) => (
                  <li key={step.n} className="flex gap-4">
                    <span className="flex w-9 shrink-0 justify-center pt-0.5">
                      <SpineNode state={i === 0 ? 'active' : 'pending'}>
                        <span className="font-mono text-2xs font-semibold">{step.n}</span>
                      </SpineNode>
                    </span>
                    <div className="min-w-0 pb-1">
                      <h3 className="font-display text-lg font-semibold tracking-tight">{step.t}</h3>
                      <p className="mt-2 max-w-measure text-sm leading-relaxed text-ink-muted">{step.d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </Spine>

            {/* Wide viewports get the same three steps laid out horizontally,
                with the rail rotated into a horizontal rule. */}
            <ol className="mt-16 hidden grid-cols-3 gap-10 md:grid">
              {STEPS.map((step, i) => (
                <FadeIn as="li" key={step.n} delay={i * 0.08} className="relative">
                  <div className="mb-5 flex items-center gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/12 font-mono text-2xs font-semibold text-accent ring-1 ring-inset ring-accent/25">
                      {step.n}
                    </span>
                    <span className="holo-rule flex-1" />
                  </div>
                  <h3 className="font-display text-lg font-semibold tracking-tight">{step.t}</h3>
                  <p className="mt-2.5 max-w-measure text-sm leading-relaxed text-ink-muted">{step.d}</p>
                </FadeIn>
              ))}
            </ol>
          </div>
        </section>

        {/* -------------------------------------------------------- surfaces */}
        <section
          id="surfaces"
          className="relative border-y border-glass-edge/[0.06] px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32"
        >
          <Void variant="ambient" />

          <div className="relative mx-auto max-w-content">
            <SectionHead
              eyebrow="The app"
              title="Six surfaces, one job each"
              sub="No dashboard sprawl. Each screen answers exactly one question."
            />

            <div className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 sm:grid-cols-2 lg:grid-cols-3">
              {SURFACES.map(({ icon: Icon, name, line }, i) => (
                <FadeIn key={name} delay={i * 0.05}>
                  {/*
                    Each card is its own tilt surface. A shared perspective
                    across the grid would mean the cards at the edges tip away
                    from the viewer even when untouched, which reads as a
                    layout bug rather than as depth.
                  */}
                  <Tilt max={5} lift={12} className="h-full">
                    <div className="glass sheen group h-full rounded-card p-5 transition-[border-color,box-shadow] duration-300 ease-out hover:border-accent/25 hover:shadow-glow sm:p-6">
                      <span className="relative grid h-10 w-10 place-items-center rounded-xl bg-accent/12 text-accent-vivid ring-1 ring-inset ring-accent/20 transition-colors duration-300 group-hover:bg-accent/20">
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <h3 className="mt-4 font-display text-base font-semibold tracking-tight layer-1">
                        {name}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{line}</p>
                    </div>
                  </Tilt>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- engine */}
        <section className="relative px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <Void variant="ambient" />

          <div className="relative mx-auto max-w-content">
            <SectionHead
              eyebrow="The engine"
              title="The model judges. The code computes."
              sub="Asked to write six months of daily tasks, a language model produces a shallow list, arithmetic that does not add up, and URLs that do not exist. So Kairo uses it for the two things it is uniquely good at, and computes everything else."
            />

            <div className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 lg:grid-cols-2 lg:gap-6">
              <EngineColumn
                icon={Cpu}
                kicker="Given to the model"
                title="Judgement"
                note="~400 tokens to classify, then sharded structure generation."
                rows={JUDGEMENT}
                tone="accent"
              />
              <EngineColumn
                icon={Code2}
                kicker="Kept in code"
                title="Arithmetic"
                note="Enforced by tests, not by prompt instructions a model may ignore."
                rows={ARITHMETIC}
                tone="cyan"
              />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------ reschedule */}
        <section
          id="reschedule"
          className="relative border-y border-glass-edge/[0.06] px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32"
        >
          <Void variant="ambient" />

          <div className="relative mx-auto max-w-content">
            <SectionHead
              eyebrow="The reschedule engine"
              title="Every plan survives contact with a bad week"
              sub="This is the part that decides whether you are still using Kairo in month three. A study plan does not fail because the syllabus was wrong — it fails the first week you miss two days, open the app, and find a wall of overdue tasks with no way back in."
            />

            <div className="mt-12 grid grid-cols-1 items-start gap-8 sm:mt-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-14">
              <FadeIn>
                <RescheduleDiagram />
              </FadeIn>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:gap-5">
                {RESCHEDULE.map(({ icon: Icon, title, body }, i) => (
                  <FadeIn key={title} delay={0.06 + i * 0.05}>
                    <div className="glass h-full rounded-card p-5">
                      <span className="grid h-9 w-9 place-items-center rounded-lg bg-accent/12 text-accent-vivid ring-1 ring-inset ring-accent/20">
                        <Icon className="h-4 w-4" />
                      </span>
                      <h3 className="mt-3.5 font-display text-[0.9375rem] font-semibold tracking-tight">
                        {title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                    </div>
                  </FadeIn>
                ))}
              </div>
            </div>

            {/*
              The three things built into every plan *before* anything slips.
              Rescheduling is the recovery path; these are what stop most
              slippage from needing one.
            */}
            <FadeIn delay={0.2} className="mt-8">
              <div className="glass rounded-panel p-5 sm:p-6">
                <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-cyan">
                  And before anything slips
                </p>
                <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
                  {[
                    ['A catch-up day every two weeks', 'Schedules no new material at all. It is not a rest day — it is the slack the plan needs to absorb a bad week without any intervention.'],
                    ['A reserved final block', 'The last stretch before your deadline is held for revision and can never be consumed by new topics, however far behind you get.'],
                    ['Honest deferral, not compression', 'If the material genuinely cannot fit, the lowest-value topics are marked optional and shown to you — rather than everything being squeezed until none of it teaches anything.'],
                  ].map(([title, body]) => (
                    <div key={title} className="flex gap-3">
                      <span
                        aria-hidden
                        className="mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-vivid"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">{title}</p>
                        <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </FadeIn>
          </div>
        </section>

        {/* ------------------------------------------------------------- why */}
        <section
          id="why"
          className="relative border-y border-glass-edge/[0.06] px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-32"
        >
          <Void variant="ambient" />

          <div className="relative mx-auto max-w-content">
            <SectionHead
              eyebrow="Why it holds up"
              title="The plan is computed, not improvised"
              sub="These are properties of the algorithm, checked by the test suite — not hopes expressed in a prompt."
            />

            <div className="mt-12 grid grid-cols-1 gap-4 sm:mt-16 md:grid-cols-2 lg:gap-6">
              {PRINCIPLES.map(({ icon: Icon, title, body }, i) => (
                <FadeIn key={title} delay={i * 0.06}>
                  <div className="glass h-full rounded-card p-5 sm:p-6">
                    <div className="flex gap-4">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent-vivid ring-1 ring-inset ring-accent/20">
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
                        <p className="mt-2 max-w-measure text-sm leading-relaxed text-ink-muted">{body}</p>
                      </div>
                    </div>
                  </div>
                </FadeIn>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- cta */}
        <section className="relative overflow-hidden px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
          <Void variant="hero" />

          {/* A single large orbit, centred behind the call to action. */}
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[min(760px,150%)] -translate-x-1/2 -translate-y-1/2 opacity-60"
          >
            <OrbitRings count={4} lit={2} />
          </div>

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-display text-fluid-h2 font-semibold tracking-tight">
              What are you preparing for?
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-base leading-relaxed text-ink-muted lg:text-lg">
              Name it, give it a deadline, and have a day-by-day map in a couple of minutes.
            </p>
            <div className="mt-9 flex justify-center">
              <Button asChild size="lg" className="px-8">
                <Link href="/app/new">
                  Build my prep map
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-glass-edge/[0.06] px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-content flex-col items-center justify-between gap-5 sm:flex-row">
          <KairoLogo size="sm" id="footer" />
          <p className="text-center text-xs text-ink-faint sm:text-right">
            © {new Date().getFullYear()} Kairo · Built for people with a deadline.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <FadeIn className="max-w-2xl">
      <div className="flex items-center gap-3">
        <span className="text-2xs font-semibold uppercase tracking-[0.18em] text-accent">{eyebrow}</span>
        {/*
          A light travelling along the rule beside the eyebrow. Contained in an
          overflow-hidden track so the sweep is clipped to the rule's length
          rather than running across the section.
        */}
        <span aria-hidden className="relative h-px flex-1 overflow-hidden bg-line">
          <span className="absolute inset-y-0 left-0 w-1/4 animate-scan-x bg-gradient-to-r from-transparent via-accent-vivid to-transparent" />
        </span>
      </div>
      <h2 className="mt-4 font-display text-fluid-h2 font-semibold tracking-tight">{title}</h2>
      <p className="mt-4 text-sm leading-relaxed text-ink-muted md:text-base">{sub}</p>
    </FadeIn>
  );
}

/** One half of the model-versus-code split. */
function EngineColumn({
  icon: Icon,
  kicker,
  title,
  note,
  rows,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  kicker: string;
  title: string;
  note: string;
  rows: Array<{ job: string; why: string }>;
  tone: 'accent' | 'cyan';
}) {
  const accent = tone === 'accent';

  return (
    <FadeIn delay={accent ? 0 : 0.1} className="h-full">
      <div className="glass relative h-full overflow-hidden rounded-panel p-6 sm:p-8">
        {/* A wash keyed to the column's hue, so the two halves are separable
            at a glance without a heavy border between them. */}
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-40 ${
            accent
              ? 'bg-[radial-gradient(70%_100%_at_20%_0%,rgb(var(--accent)/0.12),transparent_70%)]'
              : 'bg-[radial-gradient(70%_100%_at_20%_0%,rgb(var(--accent-2)/0.10),transparent_70%)]'
          }`}
        />

        <div className="relative">
          <div className="flex items-center gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${
                accent
                  ? 'bg-accent/12 text-accent-vivid ring-accent/20'
                  : 'bg-cyan/12 text-cyan-vivid ring-cyan/20'
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
            <div>
              <span
                className={`text-2xs font-semibold uppercase tracking-[0.16em] ${
                  accent ? 'text-accent' : 'text-cyan'
                }`}
              >
                {kicker}
              </span>
              <h3 className="font-display text-lg font-semibold tracking-tight">{title}</h3>
            </div>
          </div>

          <ul className="mt-6 space-y-4">
            {rows.map((row) => (
              <li key={row.job} className="flex gap-3">
                <span
                  className={`mt-[0.4rem] h-1.5 w-1.5 shrink-0 rounded-full ${
                    accent ? 'bg-accent-vivid' : 'bg-cyan-vivid'
                  }`}
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{row.job}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-muted">{row.why}</p>
                </div>
              </li>
            ))}
          </ul>

          <p className="mt-6 border-t border-line/70 pt-4 text-xs leading-relaxed text-ink-faint">
            {note}
          </p>
        </div>
      </div>
    </FadeIn>
  );
}

/**
 * Before and after a replan.
 *
 * Two stacks of days: three missed, then the same work redistributed across
 * what remains. It is drawn rather than described because the interesting part
 * is *shape* — the overdue block does not thin out across the whole remaining
 * plan, it lands in the next few days and then the schedule returns to normal.
 *
 * Pure CSS bars rather than a chart library: there are fourteen rectangles
 * here, and the numbers are illustrative of the algorithm's behaviour rather
 * than measured from a specific plan.
 */
function RescheduleDiagram() {
  // Capacity is 100. Missed days sit at 0; the redistributed days run over,
  // capped by the algorithm's 25% overflow allowance.
  const before = [100, 100, 0, 0, 0, 100, 100];
  const after = [100, 100, 125, 125, 120, 100, 100];
  const missed = [false, false, true, true, true, false, false];

  return (
    <div className="glass relative overflow-hidden rounded-panel p-5 sm:p-6">
      <div className="holo-rule absolute inset-x-0 top-0" />

      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 shrink-0 text-accent-vivid" aria-hidden />
        <p className="text-2xs font-semibold uppercase tracking-[0.16em] text-ink-faint">
          One tap, three missed days
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <DayStack
          label="You missed Wednesday to Friday"
          bars={before}
          missed={missed}
          tone="danger"
          caption="3 days overdue · 4h 30m of unfinished work"
        />

        <div className="flex items-center gap-2 text-ink-faint">
          <span aria-hidden className="h-px flex-1 bg-line" />
          <ArrowRight className="h-3.5 w-3.5 rotate-90" aria-hidden />
          <span className="text-2xs font-medium uppercase tracking-wider">Re-cut</span>
          <span aria-hidden className="h-px flex-1 bg-line" />
        </div>

        <DayStack
          label="Absorbed into the next three days"
          bars={after}
          missed={[false, false, false, false, false, false, false]}
          tone="accent"
          caption="Same deadline · no day over 125% of your stated capacity"
        />
      </div>

      <p className="mt-5 border-t border-glass-edge/[0.07] pt-4 text-2xs leading-relaxed text-ink-faint">
        The dashed line is the capacity you gave us. Work spills past it only as far as the
        algorithm's overflow allowance, then moves to the following day.
      </p>
    </div>
  );
}

function DayStack({
  label,
  bars,
  missed,
  tone,
  caption,
}: {
  label: string;
  bars: number[];
  missed: boolean[];
  tone: 'accent' | 'danger';
  caption: string;
}) {
  const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  return (
    <div>
      <p className="mb-2.5 text-xs font-medium text-ink">{label}</p>

      <div className="relative flex h-24 items-end gap-1.5 sm:gap-2">
        {/*
          The capacity line, at 100 of a 130-unit scale. Dashed and behind the
          bars, so "over capacity" is legible as a bar crossing a line rather
          than as a colour the reader has to be told the meaning of.
        */}
        <span
          aria-hidden
          className="absolute inset-x-0 border-t border-dashed border-ink-faint/40"
          style={{ bottom: `${(100 / 130) * 100}%` }}
        />

        {bars.map((value, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end gap-1.5">
            <div
              className={cn(
                'w-full rounded-t-[3px] transition-all duration-500',
                missed[i]
                  ? 'bg-danger/25 ring-1 ring-inset ring-danger/40'
                  : value > 100
                    ? 'bg-gradient-to-t from-accent-vivid to-cyan-vivid shadow-glow'
                    : 'bg-accent/35',
              )}
              style={{ height: `${Math.max(3, (value / 130) * 100)}%` }}
            />
          </div>
        ))}
      </div>

      <div className="mt-1.5 flex gap-1.5 sm:gap-2">
        {DAYS.map((day, i) => (
          <span
            key={i}
            className={cn(
              'flex-1 text-center font-mono text-2xs',
              missed[i] ? 'text-danger' : 'text-ink-faint',
            )}
          >
            {day}
          </span>
        ))}
      </div>

      <p
        className={cn(
          'mt-2.5 text-2xs',
          tone === 'danger' ? 'text-danger' : 'text-cyan',
        )}
      >
        {caption}
      </p>
    </div>
  );
}

/**
 * Static mock of the Today screen — the product's actual centre of gravity.
 *
 * Drawn with the same orbit rail and the same glass the real screen uses, so
 * the thing a visitor sees on the marketing page is recognisably the thing they
 * get. Wrapped in a tilt so it reads as a physical object floating above the
 * void rather than as a screenshot pasted onto the page.
 */
function PrepMapPreview() {
  const items = [
    { kind: 'Learn', title: 'Setup & hold time violations', time: '55m', tone: 'accent', done: true },
    { kind: 'Practice', title: 'Timing problem set 3', time: '40m', tone: 'cyan', done: true },
    { kind: 'Review', title: 'Recall: Metastability', time: '15m', tone: 'cyan', done: false },
    { kind: 'Learn', title: 'Clock domain crossing — part 1', time: '50m', tone: 'accent', done: false },
  ];

  return (
    <div className="relative w-full min-w-0">
      {/* Bloom behind the panel, so it appears lit from within. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-shell bg-[radial-gradient(70%_70%_at_50%_0%,rgb(var(--accent)/0.2),transparent_70%)] blur-2xl sm:-inset-6"
      />

      <Tilt max={7} lift={16} perspective={1200} className="relative w-full min-w-0">
        {/*
          This one card gets an opaque base under the glass, which no other
          panel in the app needs.

          It is the only surface sitting directly on the orbit field, and at the
          system's normal transparency the field's rings and nodes read straight
          through it and land on top of the task titles. `bg-bg/70` occludes
          enough for text to hold its contrast while still letting the orbit
          ghost through behind it — which is the effect worth having, rather
          than the one where you cannot tell the card from the background.
        */}
        <div aria-hidden className="absolute inset-0 rounded-shell bg-bg/70" />

        <div
          aria-hidden
          className="glass-raised relative w-full min-w-0 overflow-hidden rounded-shell shadow-e4"
        >
          {/* Specular top edge — the single detail that reads as bevelled glass. */}
          <div className="holo-rule absolute inset-x-0 top-0" />

          <div className="flex items-center justify-between border-b border-glass-edge/[0.07] px-4 py-3.5 sm:px-5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse-ring rounded-full bg-accent-vivid" />
              <span className="text-xs font-medium sm:text-sm">Today</span>
            </div>
            <span className="font-mono text-2xs font-medium uppercase tracking-wider text-ink-faint">
              Day 24 / 180
            </span>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-2 layer-1">
              <h3 className="font-display text-sm font-semibold tracking-tight sm:text-base">
                Timing closure
              </h3>
              <span className="font-mono text-xs font-medium text-accent sm:text-sm">2h 40m</span>
            </div>

            <div className="well mt-3 h-1.5 overflow-hidden rounded-full">
              <div className="h-full w-[52%] rounded-full bg-gradient-to-r from-accent-vivid to-cyan-vivid shadow-glow" />
            </div>

            <Spine x="0.75rem" inset={{ top: '1rem', bottom: '1rem' }} className="mt-4 layer-2">
              <ul className="space-y-1.5 sm:space-y-2">
                {items.map((item, i) => (
                  <li key={item.title} className="flex items-center gap-2">
                    <span className="flex w-6 shrink-0 justify-center">
                      <SpineNode
                        state={item.done ? 'done' : i === 2 ? 'active' : 'pending'}
                        size="sm"
                        className={`h-4 w-4 ${!item.done && i === 2 ? 'spine-node-live' : ''}`}
                      >
                        {item.done && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                      </SpineNode>
                    </span>

                    <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-glass-edge/[0.07] bg-glass/[0.04] px-2.5 py-2 sm:px-3 sm:py-2.5">
                      <span
                        className={`min-w-0 flex-1 truncate text-xs sm:text-sm ${
                          item.done ? 'text-ink-faint line-through' : 'text-ink'
                        }`}
                      >
                        {item.title}
                      </span>

                      <span
                        className={`shrink-0 rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${
                          item.tone === 'accent'
                            ? 'border-accent/25 bg-accent/12 text-accent'
                            : 'border-cyan/25 bg-cyan/12 text-cyan'
                        }`}
                      >
                        {item.kind}
                      </span>
                      <span className="hidden shrink-0 text-right font-mono text-2xs text-ink-faint xs:block">
                        {item.time}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Spine>

            <div className="mt-4 flex items-center justify-between border-t border-glass-edge/[0.07] pt-4 layer-1">
              <div className="flex items-center gap-1.5 text-xs sm:text-sm">
                <span className="text-sm sm:text-base">🔥</span>
                <span className="font-mono font-medium">12</span>
                <span className="text-ink-muted">day streak</span>
              </div>
              <span className="rounded-md border border-cyan/25 bg-cyan/12 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-cyan">
                On pace
              </span>
            </div>
          </div>
        </div>
      </Tilt>
    </div>
  );
}
