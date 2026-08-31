# APEX — an AI prep engine

Tell APEX what you are preparing for and by when. It works out whether that is an
exam or a role, finds the best material that actually exists, and builds a
day-by-day study map that fits the hours you really have — then coaches you
through it, drills you on it, and re-cuts it when you fall behind.

---

## The one idea

**Move the work out of the model.**

A language model asked to "generate six months of daily study tasks with
resources" produces a shallow list, arithmetic that does not add up, and URLs
that do not exist — for a large token bill. So APEX uses the model for the two
things it is uniquely good at, and computes everything else.

| Stage | Who does it | Why |
|---|---|---|
| Classify the goal | model (~400 tok) | Judgement: is "AWS SAA" an exam or a role? |
| Design units & topics | model (~2,300 tok) | Judgement: what does this subject contain? |
| Find & rank resources | **code** | APIs know view counts and durations; models invent URLs |
| Build the schedule | **code** | Fitting work into capacity is arithmetic, not prose |
| Write the plan digest | **code** | It is a projection of data we already hold |
| Generate drill questions | model, **lazily** | Pay per topic actually studied, not per topic planned |

A 26-week plan costs **about 2.7k tokens to build** and contains a real
day-by-day schedule with verified resources attached.

---

## What the scheduler guarantees

These are properties of the algorithm, enforced by tests in
`backend/planner/scheduler.test.ts` — not prompt instructions the model may ignore.

- **No day is ever scheduled past its capacity.** You give weekday and weekend
  minutes; the plan respects them exactly.
- **Prerequisites come first.** Topics are laid out in topological order.
- **Everything comes back.** Each topic returns at 2, 7 and 21 days.
- **Assessment is built in.** Unit checkpoints at boundaries, full mocks spread
  from 45% to 95% of the timeline, and a reserved final revision block.
- **Slippage is planned for.** A catch-up day every two weeks schedules no new
  material, and a reserved final block is never consumed by new topics.
- **Over-subscribed plans degrade honestly.** If the material cannot fit the
  timeline, the lowest-value topics are *deferred and shown as optional* rather
  than everything being compressed into uselessness.

---

## The surfaces

| Route | Answers |
|---|---|
| `/plan/[id]/today` | What do I study right now — with the resource already open |
| `/plan/[id]/map` | What does the whole plan look like, and where am I in it |
| `/plan/[id]/library` | Every resource, ranked, with why it was chosen |
| `/plan/[id]/drill` | Recall practice, scheduled by SM-2 spaced repetition |
| `/plan/[id]/coach` | A streaming coach that has the whole plan in context |
| `/plan/[id]/progress` | Streaks, mastery, and an honest read on finishing in time |

---

## Setup

### 1. Database

Create a Supabase project, open the SQL editor, and run
[`database/schema.sql`](database/schema.sql) once. It is idempotent.

It creates the schema, row-level security on every user-owned table, a trigger
that provisions a profile for each new auth user, and denormalised plan counters.

Then enable the sign-in methods you want under **Authentication → Providers**
(email magic-link works out of the box; Google needs OAuth credentials). Add
your callback URL — `http://localhost:3000/auth/callback` locally — under
**Authentication → URL Configuration**.

If you are running with `NEXT_PUBLIC_DEMO_MODE=true`, also run
[`database/seed-demo-user.sql`](database/seed-demo-user.sql). Demo mode bypasses
auth and pins every request to a fixed UUID, and every user-owned row carries a
foreign key to `auth.users` — without that row the first plan insert fails.

### 2. Environment

```bash
cd frontend
cp .env.example .env    # then fill it in
```

Every variable is documented in [`.env.example`](frontend/.env.example).
`GET /api/health` reports anything missing or degraded.

### 3. Run

```bash
npm install
npm run dev          # http://localhost:3000
```

### Checks

```bash
npm test             # scheduler + spaced-repetition unit tests
npm run typecheck
npm run build

# Opt-in: hits the real OpenRouter / YouTube / Tavily endpoints
RUN_INTEGRATION=1 npm test
```

---

## Layout

```text
APEX/
├── backend/                     # Plain TypeScript, imported by the Next server
│   ├── ai/                      # OpenRouter client, model tiers, JSON repair
│   ├── curation/                # Resource scoring, dedupe, topic matching
│   ├── planner/                 # Calendar, scheduler, SM-2 — the core IP
│   ├── prompts/                 # The four prompts, kept small on purpose
│   ├── services/                # Build pipeline, coach, drill, progress
│   └── tools/                   # YouTube, Tavily
├── database/schema.sql
├── docs/architecture.md
└── frontend/                    # Next.js 15 App Router
    ├── app/                     # Routes + API handlers
    ├── components/              # UI
    └── lib/                     # Supabase clients, API helpers
```

`backend/` has no `node_modules` of its own — its imports are pinned to the
frontend's copies via aliases in `next.config.js` and `tsconfig.json`. Keep those
two lists in sync.

---

## Notes for whoever runs this next

- **The service-role key bypasses RLS.** Every query written against
  `admin()` must filter by `user_id` explicitly. Ownership is enforced in the
  route handler, not by the database.
- **Plan builds run detached.** `POST /api/plans` returns immediately and the
  client watches `GET /api/plans/[id]/events` (SSE). On a serverless host with a
  short function timeout, move `buildPlan` to a queue or a background worker.
- **YouTube quota is the real ceiling on resource quality.** 10,000 units/day,
  100 per search. Curation searches once per unit, then only re-searches the
  topics that sweep left uncovered.
- **Blueprint structures are cached across users** by subject, type, level and a
  rounded study-hour bucket, so the second learner preparing for the same exam
  pays no generation cost at all.
