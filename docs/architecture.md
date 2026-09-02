# Architecture

## Request shapes

```text
Wizard  ──POST /api/intake──►  classify (nano, ~400 tok)
                              └─► prep type + 0-2 adaptive follow-ups

Wizard  ──POST /api/plans───►  create row, return id, build DETACHED
                                        │
Client  ──GET  /api/plans/[id]/events──►│  SSE: stage-by-stage narration
                                        ▼
                    ┌───────────────────────────────────────────┐
                    │ 0. discovery   subject-level searches     │ ← starts first,
                    │                                           │   runs underneath
                    │ 1. blueprint   outline  (~800 tok)        │   everything below
                    │                   │                       │
                    │                   ├── topics shard 1 ─┐   │ cached
                    │                   ├── topics shard 2 ─┤   │ across
                    │                   └── topics shard 3 ─┘   │ users
                    │                          concurrent       │
                    │ 2. curate      code, 0 tok  ─┐            │ runs alongside
                    │ 3. persist     units/topics ─┘ concurrent │ the writes
                    │ 4. schedule    code, 0 tok                │
                    │ 5. digest      code, 0 tok                │
                    └───────────────────────────────────────────┘
                                        ▼
                                  status = ready
```

Measured on a 26-week GATE plan (12 units, 80 topics): the structure stage takes
**25.9s** sharded, against **33.0s** for the same content in one response — and
the sharded run produced 23% more topics. Sharding costs prompt tokens (each
shard re-sends the unit list) and buys wall-clock, which is the trade worth
making: output tokens are emitted serially, prompt tokens are not.

## Why the split

Everything a model is asked for here is a *judgement*. Everything else is
computed. That boundary is the whole design.

The model never sees or emits a URL. It emits a natural-language **search
intent** per unit ("network theory nodal mesh analysis lecture"); the curation
pipeline runs that against real APIs and binds results to topics with text
similarity. A hallucinated link is therefore not merely unlikely — it is not
representable.

Likewise the model never emits a date or a day number. It emits topics with time
estimates and prerequisites; the scheduler fits them to the learner's real
capacity. This is why plan quality does not degrade as the timeline grows: a
52-week plan costs exactly the same tokens as a 4-week one.

## Modules

### `backend/ai`

`gemini.ts` — native Gemini client with JSON mode (`responseMimeType`), a
streaming generator, and `thinkingConfig.thinkingBudget: 0` on structured work.
That last one matters: filling in a schema is not reasoning, and thinking costs
about a third of the latency of a small JSON call for nothing. A slug that
rejects the field gets one retry without it.

`openrouter.ts` — the nano and chat tiers. Detects and rejects the two ways a
free model returns nothing useful: an empty completion, and a reasoning trace
leaked into `content` (`nvidia/nemotron-3.5-lightning:free` opens with "Here's a
thinking process:").

`provider-error.ts` — one error type carrying HTTP status and the upstream's
`Retry-After`, so the router can tell "busy, try again" from "this slug is
retired" instead of parsing message strings.

`resilience.ts` — two mechanisms that stop the pipeline rate-limiting itself:

- **`ProviderGate`** caps how fast requests leave, per provider. Builds burst
  naturally — every unit search at once, three blueprint shards at once — and a
  burst is precisely what trips a per-minute limit. Start times are reserved
  synchronously, because computing a delay and *then* recording it lets every
  concurrent caller read the same value and fire together.
- **`ModelBreaker`** remembers which models are unusable and for how long,
  honouring `Retry-After` exactly when given. A rate-limited model is *skipped*,
  not retried; without this a three-model chain still spends its whole budget on
  the first model.

`model-router.ts` — tiers by job size, and a **cross-provider fallback chain**
per tier. Crossing providers is the point: free tiers do not fail one model at a
time, so a chain of three Gemini slugs is a chain of one. Also holds the
`TokenLedger`, so a build's cost is measured rather than estimated.

`json.ts` — progressive JSON repair (fences, smart quotes, trailing commas,
truncation), with the repair pass pinned to the tier that produced the output.

### `backend/curation`
Two-pass. Pass one searches once per unit — topics in a unit share vocabulary,
so one search covers several of them at a twelfth of the quota cost. Pass two
targets only the topics pass one left uncovered.

Scoring uses real API metadata: log-compressed view counts, like ratio, duration
fit (peaking at 12–75 minutes, one study block), recency decay with a six-year
half-life, and domain authority for web results.

Two penalties matter:
- **Reuse** — stops one popular video being pinned to every topic.
- **Breadth** — a syllabus PDF matches every topic's keywords because it *is*
  the syllabus. Breadth is therefore a penalty, and a resource matching most of
  the plan is treated as covering nothing specifically.

Where no on-topic resource exists, the fallback is restricted to the same unit.
Adjacent context is defensible; a resource from a different unit is not.

### `backend/planner`
`calendar.ts` builds the study calendar and reserves two structures that stop a
plan collapsing on first contact with real life: a catch-up day every fortnight
that schedules no new material, and a final revision block never consumed by new
topics.

`scheduler.ts` is the core. Topological ordering, capacity-bounded placement,
expanding-interval review, unit checkpoints, spread mocks, and — when demand
exceeds capacity — deferral of low-value leaf topics before compression, so the
surviving material still gets enough time to be learned.

Three of its rules exist for the learner rather than for the arithmetic:

- **Block length scales with difficulty.** A flat 90-minute ceiling treats "list
  the SI units" and "derive the small-signal model" as the same kind of work.
  Difficulty 5 caps at 40 minutes — the same total time, delivered as more,
  shorter blocks, which is what a learner actually completes.
- **At most three new topics open per day.** Interleaving helps retention, but a
  free Saturday with four hours of capacity would otherwise start five unrelated
  concepts and consolidate none. Past the cap the day fills with practice and
  review of what is already open.
- **Day one is a ten-minute certain win.** It is the highest-attrition day in any
  plan, the only one where the learner has no evidence they can do this, so the
  first thing they do is finish something.

Reviews are also drained *before* new material each day: retrieving yesterday's
topic is what makes today's stick, and it is the first thing skipped when it
comes last.

`spaced.ts` is SM-2, driving both the drill queue and topic mastery.

### `backend/prompts`

The blueprint prompt is written against learner psychology rather than against
subject taxonomy, because the failure mode of a curriculum model is not
inaccuracy — it is producing a syllabus that is *correct and unusable*. Left
alone it emits "Advanced Transform-Domain Techniques and Their Applications",
estimates four hours of first-pass study, and fuses three ideas into one entry.

So the rules are: one idea per topic (a title needing "and" is two topics);
`m` bounded to 20–120 minutes so every topic is finishable in one or two
sittings; the first topics of unit 1 pinned to difficulty 1–2, because
self-efficacy predicts persistence better than motivation does; difficulty
ramping inside each unit; and titles a learner recognises *before* studying.

The minute bound is enforced in code as well as asked for in the prompt — a
prompt constraint is a request, and `m: 300` reaches the learner as five
consecutive blocks carrying the same title.

`BLUEPRINT_VERSION` is part of the blueprint cache key. Without it, every
learner who already generated a plan for a subject keeps being served the
structure produced by the previous prompt.

### `backend/services`

`blueprint-builder.ts` generates the structure in two stages: one small call for
the unit outline, then two or three **concurrent** calls filling in topics for a
slice of those units. Wall-clock becomes `outline + slowest shard` rather than
the sum, and a failed shard costs its units' topics instead of the whole build.
Shards are split to balance summed unit *weight*, not unit count, because weight
is what drives output volume and the build waits on the heaviest shard. Three is
the ceiling: free Gemini allows roughly ten requests a minute, so one call per
unit would rate-limit a ten-unit plan reliably.

Merging is the subtle part, and is unit-tested directly. Shards number `dep`
against their own output — they cannot know the global ordinal of a topic another
shard has not written yet — so ordinals are rebased on merge. Getting that wrong
does not fail; it quietly reorders the syllabus, because the scheduler sorts
topologically.

`plan-service.ts` orchestrates the build and owns `replan`. Its stage order is
chosen for wall-clock, not readability: subject-level resource discovery starts
*before* the structure call, and curation runs alongside the database writes,
because neither depends on the other. `coach-service.ts`
assembles chat context from three cheap sources — a precomputed digest, today's
items, and the three topics whose keywords best match the question — instead of
one expensive one. `practice-service.ts` generates drill questions lazily per
topic and caches them forever. `progress-service.ts` derives every figure from
logged completions, never from planned minutes.

## Data model

`plans → units → topics` is the knowledge structure.
`plans → sessions → session_items` is the schedule.
`resources` and `topic_resources` bind material to topics.
`questions → reviews` is the drill engine. `study_logs` drives streaks and pace.

Every user-owned table carries `user_id` and an identical RLS owner policy. The
build pipeline uses the service-role key and bypasses RLS by design, so
ownership on those paths is enforced in the route handler.

`plans.total_items` / `done_items` are kept current by a trigger on
`session_items`, so a plan list never issues a `count(*)` per card.

## Authentication

One landing point, `/auth/callback`, handles all three shapes that arrive there,
because which one you get depends on the provider and on Supabase project
settings rather than on anything this app controls: `?code=` (PKCE — Google, and
magic links on a PKCE project), `?token_hash=&type=` (the newer email shape), and
`?error=` (the provider refused, or the learner cancelled). The third is a normal
outcome, not an exception, and it has to be *shown* — a failure the login page
silently swallows is indistinguishable from sign-in being broken.

Two rules the flow depends on:

- **Redirects are built from the origin the browser used**, resolved from
  `APP_ORIGIN` or the forwarded headers — never from `request.url`. Behind a
  proxy those differ, and the difference is an HTTPS session downgraded to HTTP,
  whose `Secure` auth cookie is then dropped: a sign-in that loops back to the
  login page with nothing in the logs.
- **`next=` is reduced to a same-origin path.** `startsWith('/')` is not enough:
  `//evil.example` is a protocol-relative URL a browser follows off-site.

Middleware gates the app routes and returns **401 JSON for `/api/*`** rather than
a 307 to a page of HTML — `fetch(...).json()` on a login page is the
"Unexpected token <" that makes an expired session look like a broken feature.

The one failure no runtime check can catch: `NEXT_PUBLIC_*` are compiled into the
browser bundle at *build* time, so a Docker image built without them ships
`undefined` credentials while every server route keeps working. The Dockerfile
takes them as build args and refuses to build without them, and
`GET /api/health` reports the bundled values separately from the server ones.

## Failure behaviour

- Classification failing degrades to a `skill` blueprint rather than blocking
  plan creation.
- A model that is rate-limited or retired is skipped for a cooldown and the tier
  falls through to the next model in its chain — crossing providers, so a
  vendor-wide outage is survivable. Every fallback is recorded against the build.
- A blueprint shard failing costs its units' topics, not the plan. Losing the
  outline, or most of the shards, falls back to the original single call.
- Tavily or YouTube failing returns an empty list; the plan builds with weaker
  resources rather than not at all.
- A build crash sets `status = 'failed'` with the message, and the build view
  offers a retry that first clears partial rows so a retry cannot duplicate.
- A coach stream that dies mid-reply persists what arrived and says so. It falls
  back to another model only if the stream never opened — switching mid-reply
  would splice two voices into one answer.
