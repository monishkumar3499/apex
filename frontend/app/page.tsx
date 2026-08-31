import Link from 'next/link';
import {
  Compass, ArrowRight, CalendarDays, Library, Brain, LineChart, Sparkles,
  ShieldCheck, Repeat, Layers, Timer, Check,
} from 'lucide-react';
import { ThemeToggle } from '../components/theme';
import { Badge } from '../components/ui';

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

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* ------------------------------------------------------------ nav */}
      <header className="sticky top-0 z-40 border-b border-line/70 bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-fg">
              <Compass className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <span className="font-display text-base font-semibold tracking-tight">APEX</span>
          </Link>

          <nav className="hidden items-center gap-7 text-sm text-ink-muted md:flex">
            <a href="#how" className="transition-colors hover:text-ink">How it works</a>
            <a href="#surfaces" className="transition-colors hover:text-ink">The app</a>
            <a href="#why" className="transition-colors hover:text-ink">Why it holds up</a>
          </nav>

          <div className="flex items-center gap-1.5">
            <ThemeToggle />
            <Link
              href="/app"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-accent-fg transition-colors hover:bg-accent-hover"
            >
              Start free
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* --------------------------------------------------------- hero */}
        <section className="relative overflow-hidden px-5 pb-24 pt-20 sm:pt-28">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(55%_75%_at_50%_0%,rgb(var(--accent)/0.11),transparent_72%)]"
          />

          <div className="relative mx-auto max-w-6xl">
            <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
              <div className="animate-in">
                <Badge tone="accent" className="mb-6">
                  <Sparkles className="h-3 w-3" />
                  AI prep engine
                </Badge>

                <h1 className="font-display text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                  Stop collecting resources.
                  <br />
                  <span className="text-accent">Start following a plan.</span>
                </h1>

                <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-muted">
                  Tell APEX what you are preparing for and by when. It finds the best
                  material that actually exists, then maps every day between now and your
                  deadline around the hours you really have.
                </p>

                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <Link
                    href="/app/new"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-7 font-medium text-accent-fg shadow-sm transition-all hover:bg-accent-hover hover:shadow"
                  >
                    Build my prep map
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a
                    href="#how"
                    className="inline-flex h-12 items-center justify-center rounded-xl border border-line-strong px-7 font-medium transition-colors hover:bg-surface-2"
                  >
                    See how it works
                  </a>
                </div>

                <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-muted">
                  {['Exams and career prep', 'Real, verified resources', 'Free to start'].map((line) => (
                    <li key={line} className="flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-success" strokeWidth={2.5} />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>

              <PrepMapPreview />
            </div>
          </div>
        </section>

        {/* ----------------------------------------------------- how it works */}
        <section id="how" className="border-y border-line bg-surface-2/40 px-5 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHead
              eyebrow="How it works"
              title="Three answers, then a plan you can actually run"
              sub="Setup takes about a minute. Building the map takes about two."
            />

            <ol className="mt-14 grid gap-8 md:grid-cols-3">
              {[
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
              ].map((step) => (
                <li key={step.n} className="relative">
                  <span className="font-mono text-2xs font-semibold tracking-widest text-accent">{step.n}</span>
                  <h3 className="mt-3 font-display text-lg font-semibold">{step.t}</h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-ink-muted">{step.d}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* -------------------------------------------------------- surfaces */}
        <section id="surfaces" className="px-5 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHead
              eyebrow="The app"
              title="Five surfaces, one job each"
              sub="No dashboard sprawl. Each screen answers exactly one question."
            />

            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SURFACES.map(({ icon: Icon, name, line }) => (
                <div
                  key={name}
                  className="surface group rounded-card p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/30"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/12 text-accent">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="mt-4 font-display text-base font-semibold">{name}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{line}</p>
                </div>
              ))}

              <div className="rounded-card border border-dashed border-line p-6">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-3 text-ink-faint">
                  <Compass className="h-4.5 w-4.5" />
                </div>
                <h3 className="mt-4 font-display text-base font-semibold">Coach</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
                  Knows your whole plan and where you are in it. Ask it to explain, unstick you,
                  or tell you honestly whether you are on track.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- why */}
        <section id="why" className="border-y border-line bg-surface-2/40 px-5 py-24">
          <div className="mx-auto max-w-6xl">
            <SectionHead
              eyebrow="Why it holds up"
              title="The plan is computed, not improvised"
              sub="Asking a model to write six months of tasks gives you a shallow list with the arithmetic wrong. Scheduling is a solvable problem, so APEX solves it."
            />

            <div className="mt-14 grid gap-x-10 gap-y-10 md:grid-cols-2">
              {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/12 text-accent">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div>
                    <h3 className="font-display text-base font-semibold">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- cta */}
        <section className="px-5 py-28">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              What are you preparing for?
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-ink-muted">
              Name it, give it a deadline, and have a day-by-day map in a couple of minutes.
            </p>
            <Link
              href="/app/new"
              className="mt-9 inline-flex h-12 items-center gap-2 rounded-xl bg-accent px-8 font-medium text-accent-fg shadow-sm transition-all hover:bg-accent-hover hover:shadow"
            >
              Build my prep map
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line px-5 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2 text-ink-muted">
            <Compass className="h-4 w-4" />
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
      <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-3.5 text-base leading-relaxed text-ink-muted">{sub}</p>
    </div>
  );
}

/** Static mock of the Today screen — the product's actual centre of gravity. */
function PrepMapPreview() {
  const items = [
    { kind: 'Learn', title: 'Setup & hold time violations', time: '55m', tone: 'accent', done: true },
    { kind: 'Practice', title: 'Timing problem set 3', time: '40m', tone: 'info', done: true },
    { kind: 'Review', title: 'Recall: Metastability', time: '15m', tone: 'info', done: false },
    { kind: 'Learn', title: 'Clock domain crossing — part 1', time: '50m', tone: 'accent', done: false },
  ];

  return (
    <div className="relative animate-in [animation-delay:120ms]">
      <div
        aria-hidden
        className="absolute -inset-6 rounded-[28px] bg-[radial-gradient(70%_70%_at_50%_0%,rgb(var(--accent)/0.10),transparent_70%)]"
      />

      <div className="surface-raised relative overflow-hidden rounded-panel">
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-accent animate-pulse-ring" />
            <span className="text-sm font-medium">Today</span>
          </div>
          <span className="tabular text-2xs font-medium uppercase tracking-wider text-ink-faint">
            Day 24 / 180
          </span>
        </div>

        <div className="px-5 py-5">
          <div className="flex items-baseline justify-between">
            <h3 className="font-display text-base font-semibold">Timing closure</h3>
            <span className="tabular text-sm font-medium text-accent">2h 40m</span>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <div className="h-full w-[52%] rounded-full bg-accent" />
          </div>

          <ul className="mt-5 space-y-2">
            {items.map((item) => (
              <li
                key={item.title}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-2 px-3 py-2.5"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border ${
                    item.done ? 'border-success bg-success text-white' : 'border-line-strong'
                  }`}
                >
                  {item.done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>

                <div className="min-w-0 flex-1">
                  <p className={`truncate text-sm ${item.done ? 'text-ink-faint line-through' : 'text-ink'}`}>
                    {item.title}
                  </p>
                </div>

                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-2xs font-semibold uppercase tracking-wide ${
                    item.tone === 'accent'
                      ? 'border-accent/25 bg-accent/12 text-accent'
                      : 'border-info/25 bg-info/12 text-info'
                  }`}
                >
                  {item.kind}
                </span>
                <span className="tabular w-9 shrink-0 text-right text-2xs text-ink-faint">{item.time}</span>
              </li>
            ))}
          </ul>

          <div className="mt-5 flex items-center justify-between border-t border-line pt-4">
            <div className="flex items-center gap-1.5 text-sm">
              <span className="text-base">🔥</span>
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
