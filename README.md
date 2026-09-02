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
| Design units & topics | model, **sharded** | Judgement: what does this subject contain? |
| Find & rank resources | **code** | APIs know view counts and durations; models invent URLs |
| Build the schedule | **code** | Fitting work into capacity is arithmetic, not prose |
| Write the plan digest | **code** | It is a projection of data we already hold |
| Generate drill questions | model, **lazily** | Pay per topic actually studied, not per topic planned |

Measured on a 26-week GATE plan: **80 topics across 12 units in 26 seconds**,
for about 15k tokens, with a real day-by-day schedule and verified resources
attached. The structure is generated as an outline plus three concurrent topic
calls — one combined call for the same content took 33 seconds, because output
tokens are emitted serially.

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
(email magic-link works out of the box; Google needs OAuth credentials).

Under **Authentication → URL Configuration**, set:

- **Site URL** — your public origin, e.g. `http://localhost:3000`
- **Redirect URLs** — add `<origin>/auth/callback` for every origin you serve
  from. Locally that is `http://localhost:3000/auth/callback`.

Then set `APP_ORIGIN` in `frontend/.env` to that same origin. Behind a reverse
proxy the app cannot derive its own public URL — it sees a plain-HTTP request on
an internal host — and OAuth redirects will either land on the wrong host or
downgrade HTTPS to HTTP, which silently drops the auth cookie.

`GET /api/health` prints the callback URL it will actually generate. If it does
not match what Supabase has, sign-in will not complete.

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
npm test             # 109 unit tests: scheduler, SM-2, model routing,
                     # auth redirect rules, blueprint sharding, prompts
npm run typecheck
npm run build

# Opt-in: hits the real Gemini / OpenRouter / YouTube / Tavily endpoints and
# prints measured latency, coverage and the token ledger for a full build.
RUN_INTEGRATION=1 npm test
```

### 4. Docker

```bash
# The NEXT_PUBLIC_* values are compiled into the browser bundle, so they must be
# present at BUILD time. The build fails loudly if they are missing, because the
# alternative is an image whose sign-in silently does nothing.
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://your-project.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="your-anon-key" \
  -t apex-app .

docker run -d --name apex -p 3000:3000 --env-file frontend/.env apex-app
```

The GitHub Actions workflow does this automatically, reading the two values from
repository secrets (falling back to `frontend/.env` on the host), and waits for
`/api/health` to pass before calling the deploy good.

---

## Layout

```text
APEX/
├── backend/                     # Plain TypeScript, imported by the Next server
│   ├── ai/                      # Gemini + OpenRouter clients, fallback chains,
│   │                            #   rate gate, circuit breaker, JSON repair
│   ├── curation/                # Resource scoring, dedupe, topic matching
│   ├── planner/                 # Calendar, scheduler, SM-2 — the core IP
│   ├── prompts/                 # The prompts, kept small on purpose
│   ├── services/                # Build pipeline, sharded blueprint generation,
│   │                            #   coach, drill, progress
│   └── tools/                   # YouTube, Tavily
├── database/schema.sql
├── docs/architecture.md
└── frontend/                    # Next.js 15 App Router
    ├── app/                     # Routes + API handlers
    ├── components/              # UI (incl. the build-wait insight stream)
    └── lib/                     # Supabase clients, auth URL rules, API helpers
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
  topics that sweep left uncovered. Budgets scale with plan size — roughly
  1,500–2,500 units for the largest plans.
- **Blueprint structures are cached across users** by subject, type, level, a
  rounded study-hour bucket, and `BLUEPRINT_VERSION`. Bump that constant
  whenever the prompt changes, or returning learners keep getting the structure
  the *previous* prompt produced.
- **Every model tier has a cross-provider fallback chain.** Set
  `STRUCTURED_MODEL` to a comma-separated list to reorder it; a single value is
  promoted to the head of the built-in chain rather than replacing it, so
  overriding the primary model never silently discards its fallbacks. Verify any
  slug with `GET /api/health?models=1` — providers retire them without notice.
- **The free Gemini tier is about 10 requests/minute,** and one build spends four
  on the blueprint (an outline plus three concurrent shards). `ProviderGate` paces
  requests and `ModelBreaker` sidelines a 429'd model rather than retrying it, so
  concurrent builds degrade to a fallback model instead of failing.
- **Demo mode hides auth bugs.** With `NEXT_PUBLIC_DEMO_MODE=true` the OAuth path
  is never exercised, so sign-in can be completely broken and look fine.
