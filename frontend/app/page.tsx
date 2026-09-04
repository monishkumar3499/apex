import Link from 'next/link';
import {
  Compass, ArrowRight, CalendarDays, Library, Brain, LineChart, Sparkles,
  ShieldCheck, Repeat, Layers, Timer, Check, MessageSquare,
} from 'lucide-react';
import { LandingNav } from '../components/landing-nav';
import { Badge, Button, FadeIn, Spine, SpineNode } from '../components/ui';

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
    body: 'Fall behind and one tap re-cuts the remaining days around what is left — rather than leaving you with a wall of overdue tasks.',
  },
];

const STEPS = [
  {
    n: '01',
    t: 'Name the goal',
    d: 'GATE ECE, AWS Solutions Architect, or "become an ML engineer". APEX works out whether it is an exam or a role and asks the one or two follow-ups that actually change the plan.',
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

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <LandingNav />

      <main id="main">
        {/* --------------------------------------------------------- hero */}
        <section className="relative overflow-hidden px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-28 lg:pt-24">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(55%_75%_at_50%_0%,rgb(var(--accent)/0.12),transparent_72%)]"
          />

          <div className="relative mx-auto w-full max-w-content">
            {/*
              The preview leads on a phone — it is the clearest single
              explanation of what the product is — and moves beside the copy
              once the viewport is wide enough to hold both.
            */}
            {/*
              `minmax(0, …fr)` rather than a bare `…fr`: an `fr` track keeps an
              automatic min-content floor, so one long unbreakable string in the
              headline would push the column — and the page — wider than the
              viewport.
            */}
            <div className="grid w-full min-w-0 grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14 xl:gap-20">
              <FadeIn className="w-full min-w-0">
                <Badge tone="accent" className="mb-5">
                  <Sparkles />
                  AI prep engine
                </Badge>

                <h1 className="font-display text-fluid-hero font-semibold tracking-tight">
                  Stop collecting resources.{' '}
                  <span className="text-accent sm:block">Start following a plan.</span>
                </h1>

                <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-muted sm:mt-6 lg:text-lg">
                  Tell APEX what you are preparing for and by when. It finds the best material that
                  actually exists, then maps every day between now and your deadline around the
                  hours you really have.
                </p>

                <div className="mt-7 flex flex-col gap-2.5 sm:mt-8 sm:flex-row sm:gap-3">
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

                <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-ink-muted sm:gap-x-6 sm:text-sm">
                  {['Exams and career prep', 'Real, verified resources', 'Free to start'].map((line) => (
                    <li key={line} className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={2.5} aria-hidden />
                      {line}
                    </li>
                  ))}
                </ul>
              </FadeIn>

              <FadeIn delay={0.12} className="w-full min-w-0">
                <PrepMapPreview />
              </FadeIn>
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- how it works */}
        <section id="how" className="border-y border-line bg-surface-2/40 px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-content">
            <SectionHead
              eyebrow="How it works"
              title="Three answers, then a plan you can actually run"
              sub="Setup takes about a minute. Building the map takes about two."
            />

            <ol className="mt-10 grid grid-cols-1 gap-8 sm:mt-14 md:grid-cols-3 md:gap-10">
              {STEPS.map((step) => (
                <li key={step.n} className="relative">
                  <span className="font-mono text-2xs font-semibold tracking-widest text-accent">
                    {step.n}
                  </span>
                  <h3 className="mt-3 font-display text-lg font-semibold tracking-tight">{step.t}</h3>
                  <p className="mt-2.5 max-w-measure text-sm leading-relaxed text-ink-muted">{step.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* -------------------------------------------------------- surfaces */}
        <section id="surfaces" className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-content">
            <SectionHead
              eyebrow="The app"
              title="Six surfaces, one job each"
              sub="No dashboard sprawl. Each screen answers exactly one question."
            />

            <div className="mt-10 grid grid-cols-1 gap-3.5 sm:mt-14 sm:grid-cols-2 lg:grid-cols-3">
              {SURFACES.map(({ icon: Icon, name, line }) => (
                <div
                  key={name}
                  className="surface group rounded-card p-5 transition-[border-color,box-shadow,transform] duration-200 ease-out hover:border-accent/30 hover:shadow-e2 sm:p-6 pointer:hover:-translate-y-0.5"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/12 text-accent transition-colors group-hover:bg-accent/20">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="mt-4 font-display text-base font-semibold tracking-tight">{name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{line}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- why */}
        <section id="why" className="border-y border-line bg-surface-2/40 px-4 py-14 sm:px-6 sm:py-20 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-content">
            <SectionHead
              eyebrow="Why it holds up"
              title="The plan is computed, not improvised"
              sub="Asking a model to write six months of tasks gives you a shallow list with the arithmetic wrong. Scheduling is a solvable problem, so APEX solves it."
            />

            <div className="mt-10 grid grid-cols-1 gap-x-10 gap-y-8 sm:mt-14 sm:gap-y-10 md:grid-cols-2">
              {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
                    <p className="mt-1.5 max-w-measure text-sm leading-relaxed text-ink-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- cta */}
        <section className="relative overflow-hidden px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[400px] bg-[radial-gradient(50%_80%_at_50%_100%,rgb(var(--accent)/0.10),transparent_72%)]"
          />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-display text-fluid-h2 font-semibold tracking-tight">
              What are you preparing for?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-ink-muted lg:text-lg">
              Name it, give it a deadline, and have a day-by-day map in a couple of minutes.
            </p>
            <Button asChild size="lg" className="mt-8 px-8">
              <Link href="/app/new">
                Build my prep map
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
        <div className="mx-auto flex max-w-content flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-ink-muted">
            <Compass className="h-4 w-4" aria-hidden />
            <span className="font-display text-sm font-semibold text-ink">APEX</span>
          </div>
          <p className="text-xs text-ink-faint">
            © {new Date().getFullYear()} APEX · Built for people with a deadline.
          </p>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ eyebrow, title, sub }: { eyebrow: string; title: string; sub: string }) {
  return (
    <div className="max-w-2xl">
      <span className="text-2xs font-semibold uppercase tracking-widest text-accent">{eyebrow}</span>
      <h2 className="mt-3 font-display text-fluid-h2 font-semibold tracking-tight">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted md:text-base">{sub}</p>
    </div>
  );
}

/**
 * Static mock of the Today screen — the product's actual centre of gravity.
 *
 * Drawn with the same spine the real screen uses, so the thing a visitor sees
 * on the marketing page is recognisably the thing they get. A hero mock built
 * from bespoke markup that resembles nothing in the app is how a landing page
 * ends up over-promising.
 */
function PrepMapPreview() {
  const items = [
    { kind: 'Learn', title: 'Setup & hold time violations', time: '55m', tone: 'accent', done: true },
    { kind: 'Practice', title: 'Timing problem set 3', time: '40m', tone: 'info', done: true },
    { kind: 'Review', title: 'Recall: Metastability', time: '15m', tone: 'info', done: false },
    { kind: 'Learn', title: 'Clock domain crossing — part 1', time: '50m', tone: 'accent', done: false },
  ];

  return (
    <div className="relative w-full min-w-0">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[22px] bg-[radial-gradient(70%_70%_at_50%_0%,rgb(var(--accent)/0.12),transparent_70%)] sm:-inset-4 sm:rounded-[28px]"
      />

      <div
        aria-hidden
        className="surface-raised relative w-full min-w-0 overflow-hidden rounded-panel"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5 sm:py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-ring" />
            <span className="text-xs font-medium sm:text-sm">Today</span>
          </div>
          <span className="tabular text-2xs font-medium uppercase tracking-wider text-ink-faint">
            Day 24 / 180
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-display text-sm font-semibold tracking-tight sm:text-base">
              Timing closure
            </h3>
            <span className="tabular text-xs font-medium text-accent sm:text-sm">2h 40m</span>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-sunken">
            <div className="h-full w-[52%] rounded-full bg-accent" />
          </div>

          <Spine x="0.75rem" inset={{ top: '1rem', bottom: '1rem' }} className="mt-4">
            <ul className="space-y-1.5 sm:space-y-2">
              {items.map((item) => (
                <li key={item.title} className="flex items-center gap-2">
                  <span className="flex w-6 shrink-0 justify-center">
                    <SpineNode state={item.done ? 'done' : 'pending'} size="sm" className="h-4 w-4">
                      {item.done && <Check className="h-2.5 w-2.5" strokeWidth={3.5} />}
                    </SpineNode>
                  </span>

                  <span className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface-2 px-2.5 py-2 sm:px-3 sm:py-2.5">
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
                          : 'border-info/25 bg-info/12 text-info'
                      }`}
                    >
                      {item.kind}
                    </span>
                    <span className="tabular hidden shrink-0 text-right text-2xs text-ink-faint xs:block">
                      {item.time}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </Spine>

          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 sm:pt-4">
            <div className="flex items-center gap-1.5 text-xs sm:text-sm">
              <span className="text-sm sm:text-base">🔥</span>
              <span className="tabular font-medium">12</span>
              <span className="text-ink-muted">day streak</span>
            </div>
            <span className="rounded-md border border-success/25 bg-success/12 px-2 py-0.5 text-2xs font-semibold uppercase tracking-wide text-success">
              On pace
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
