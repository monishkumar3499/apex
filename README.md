# Kairo — an AI prep engine

*καιρός — the opportune moment.*

Tell Kairo what you are preparing for and by when. It works out whether that is
an exam or a role, finds the best material that actually exists, and builds a
day-by-day study map that fits the hours you really have — then coaches you
through it, drills you on it, and re-cuts it when you fall behind.

---

## The one idea

**Move the work out of the model.**

A language model asked to "generate six months of daily study tasks with
resources" produces a shallow list, arithmetic that does not add up, and URLs
that do not exist — for a large token bill. So Kairo uses the model for the two
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

## The look — Aurora Glass

Kairo is a daily-use app opened at 6am and at midnight, so the design is
dark-first and built in three layers that always paint back to front:

| Layer | What it is | Rule |
|---|---|---|
| **0 · the void** | near-black indigo with a slow aurora drifting through it | never interactive, never in focus |
| **1 · the glass** | frosted panels holding everything you read | the only layer with a hard edge |
| **2 · the light** | accent bloom, specular sweeps, the orbit rail | one element per screen, whatever is live |

The rule that keeps it from becoming decoration: **depth encodes state.**
Something nearer the viewer is more urgent, a panel that lifts is one you are
meant to act on, and blur means "behind, later, not now" — never merely
"pretty". On Today that means the open task is raised and lit while a finished
one recedes, so you can find your place on the screen without reading a word of
it.

**The orbit** is the signature graphic, and it is the name drawn: a topic is
placed once, then returns at 2, 7 and 21 days, which is an orbit rather than a
queue. It appears three ways, in descending cost — a canvas field
(`components/ui/orbit-field.tsx`) on the landing hero and the build screen, CSS
rings (`OrbitRings`) wherever the motif should be present rather than the
subject, and the vertical rail (`Spine`) on every ordered list.

Three implementation decisions worth knowing before changing any of it:

- **The 3D is CSS transforms, not WebGL.** A real scene would render this with
  proper bloom and depth of field, and cost ~150KB gzipped plus a shader
  compile before the first frame. What a learner wants in that first second is
  today's tasks, not a library booting. The one canvas is 2D with a
  pre-rendered glow sprite, it stops when scrolled off-screen or the tab is
  hidden, and it draws a single static frame under `prefers-reduced-motion`.
- **Tokens are semantic, never literal** — `accent`, not `violet`. That is what
  let the entire app be re-themed by rewriting one file: all ~40 components were
  already asking for "the accent". Violet carries *state*, cyan carries
  *quantity* (progress, counts, throughput), and magenta is at most one
  highlight per screen and never load-bearing.
- **`backdrop-filter` is the one thing that can drop frames** on a budget
  phone. `.glass` therefore carries a real opaque fallback — some older Android
  WebViews do not support it at all, and without the fallback those users get
  unreadable text over the aurora.

Light mode is a full peer, not an afterthought: same structure, cool porcelain
ground, glass frosting *down* into white instead of up out of black. `accent` is
pinned to clear AA as text in both modes, with a brighter `accent-vivid` for
fills and glyphs above 24px, which are held to 3:1 rather than 4.5:1.

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
npm test             # 145 unit tests: scheduler, SM-2, model routing,
                     # provider registry, key rotation, token buckets, the
                     # fairness queue, auth redirect rules, blueprint
                     # sharding, prompts
npm run typecheck
npm run build

# Opt-in: hits the real model / YouTube / Tavily endpoints and prints measured
# latency, coverage and the token ledger for a full build.
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
  -t kairo-app .

docker run -d --name kairo -p 3000:3000 --env-file frontend/.env kairo-app
```

The GitHub Actions workflow does this automatically, reading the two values from
repository secrets (falling back to `frontend/.env` on the host), and waits for
`/api/health` to pass before calling the deploy good.

---

## Layout

```text
Kairo/
├── backend/                     # Plain TypeScript, imported by the Next server
│   ├── ai/                      # 8-provider registry, key rotation, adaptive
│   │                            #   token buckets, fair queue, breaker, chains
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
- **Rate limits are a capacity problem, not a retry problem.** Free quota is
  metered *per API key, per vendor*, so no amount of polite backoff makes an
  exhausted bucket bigger. The defence is breadth: eight vendors are supported
  (Groq, Cerebras, Gemini, Mistral, GitHub Models, Cloudflare, Together,
  OpenRouter) and every chain spans at least four of them. All are optional; a
  missing key removes its models from every chain rather than turning them into
  failed attempts.
- **Two free multipliers, and the second one is the cheaper.** Adding a provider
  adds a bucket — but *every* provider's env var also accepts a
  **comma-separated list of keys**, and each entry is metered independently by
  the upstream. `GROQ_API_KEY="a,b"` is genuinely twice the allowance.
  `GET /api/health` reports `ai.buckets`; for 10–20 daily learners aim for four
  or more, and the health check reports "degraded" below three.
- **Why OpenRouter is last in every chain now.** A `:free` slug allows 20
  requests/minute but only **50 per day** on an account under 10 lifetime
  credits. One learner building one six-month plan can spend that alone. Groq
  and Cerebras allow roughly 13,000/day each, for free, so the volume tiers lead
  on those — which also took the coach's first token from 3–13s to under a
  second.
- **The buckets learn the real limit.** `TokenBucket` starts at each vendor's
  published RPM, halves its rate on every 429, and creeps back up after 45s of
  calm. Free tiers routinely enforce something tighter than they document, and
  the observed limit is the only one that matters.
- **A saturated provider is not a broken model.** The router distinguishes them:
  a model failure opens that model's breaker, a vendor with no headroom opens
  nothing and the work simply moves. Penalising a healthy slug because Google
  was busy would remove it from the chain for the next learner too.
- **One learner cannot starve the others.** `FairQueue` round-robins between
  learners, so a six-month build's several hundred calls do not park nineteen
  people's single drill request behind them.
- **Verify any slug before trusting it.** `GET /api/health?models=1` probes each
  tier's primary; `?models=all` probes every model in every chain. Providers
  retire slugs without notice (`openai/gpt-oss-120b:free` now 404s). When
  reordering a chain by hand, do not put two models from the same vendor in the
  first three slots — those are the slots a burst reaches, so a repeat makes one
  outage cost two attempts.
- **Demo mode hides auth bugs.** With `NEXT_PUBLIC_DEMO_MODE=true` the OAuth path
  is never exercised, so sign-in can be completely broken and look fine.
