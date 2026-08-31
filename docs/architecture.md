# Architecture

## Request shapes

```text
Wizard  ──POST /api/intake──►  classify (nano, ~400 tok)
                              └─► prep type + 0-2 adaptive follow-ups

Wizard  ──POST /api/plans───►  create row, return id, build DETACHED
                                        │
Client  ──GET  /api/plans/[id]/events──►│  SSE: stage-by-stage narration
                                        ▼
                              ┌─────────────────────────────┐
                              │ 1. blueprint   model ~2.3k  │ cached across users
                              │ 2. curate      code, 0 tok  │ YouTube + Tavily
                              │ 3. schedule    code, 0 tok  │ the prep map
                              │ 4. digest      code, 0 tok  │ coach context
                              └─────────────────────────────┘
                                        ▼
                                  status = ready
```

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
`openrouter.ts` — retries with backoff on 429/5xx, streaming generator, usage
accounting on every call. `json.ts` — progressive JSON repair (fences, smart
quotes, trailing commas, truncation) because repairing locally is far cheaper
than a retry round-trip. `model-router.ts` — tiers by job size, plus a
`TokenLedger` so a build's cost is a measured number.

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

`spaced.ts` is SM-2, driving both the drill queue and topic mastery.

### `backend/services`
`plan-service.ts` orchestrates the build and owns `replan`. `coach-service.ts`
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

## Failure behaviour

- Classification failing degrades to a `skill` blueprint rather than blocking
  plan creation.
- Tavily or YouTube failing returns an empty list; the plan builds with weaker
  resources rather than not at all.
- A build crash sets `status = 'failed'` with the message, and the build view
  offers a retry that first clears partial rows so a retry cannot duplicate.
- A coach stream that dies mid-reply persists what arrived and says so.
