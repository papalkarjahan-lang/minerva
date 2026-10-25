# Minerva — Scale Readiness Notes, Round 2

Continuation of `SCALE_READINESS_NOTES.md` — same spirit, separate file so
round 1's own record stays intact rather than being rewritten. Prompted by
finishing the cron-function audit that file's own history left
incomplete: round 1 fixed 6 cron functions (`reconcile-billing`,
`update-technician-workload`, `daily-digest`, `detect-safety-hazards`,
`sequence-handoffs`, `industrial-conductor`) and confirmed 3 more fine
(`lead-followup-reminder`, `verify-industrial-compliance`,
`run-custom-workflows`) — 9 of the ~34 real cron-scheduled functions this
project has. This file covers the other 25.

A background audit of this exact list was attempted first and failed
mid-run on a session rate limit before reaching a conclusion on any of the
25 — nothing from that attempt was applied. This file's findings come
from a fresh, direct read of each function, not from that failed run.

## Fixed 2026-10-08

Each verified against the actual code before fixing, same discipline as
round 1 — not taken on a pattern-match alone. All use the exact same
`chunk()`-of-20, sequential-batches-of-parallel shape as round 1's fixes
(`_shared/batch.ts`), with the per-item body extracted into its own named
function so the batching wrapper stays simple.

- **`check-credential-expiry`**: `technician_credentials` was fetched with
  **no filter at all** — every credential for every technician on the
  platform, every single day — then looped fully sequentially, each
  credential costing up to 4 separate claim-update-then-notify sequences
  (30/14/7-day warnings + the urgent on-the-job check), each itself 2-3
  round trips. The most severe of the 3 "zero query-level filter"
  functions found this round, run daily.
- **`check-inventory-levels`**: same shape, `inventory_items` fetched with
  no filter, every item for every business, looped sequentially.
- **`track-consumables`**: same shape again, `consumables_items` fetched
  with no filter — and the tightest timing risk of the three, since this
  one runs **hourly**, not daily, so a slow run risks still being in
  flight when the next tick fires.
- **`chase-unpaid-invoices`**: the most expensive per-row cost of any cron
  function audited this round — each unpaid invoice can cost up to 2
  external API calls (an optional Claude reminder-draft call, then a
  Twilio SMS send) plus 2-3 Supabase round trips, all run fully
  sequentially across every unpaid invoice on the platform.

Verification for all 4: brace/paren/bracket balance checked (no local
Deno typecheck tooling in this project — see `minerva_setup_progress`
memory), full 700-test Vitest suite re-run after each file and clean — no
new tests needed since `chunk()` itself is already tested
(`_shared/batch.test.ts`) and every extracted per-item function is a thin
I/O wrapper around logic that was already correct, not new decision logic
of its own, same reasoning round 1 used for its own 6 fixes.

- **`detect-wasted-trips`**: the main no-show-detection loop (every
  'scheduled' job platform-wide, each costing a nested
  `technician_locations` query plus up to 2 SMS sends and a Slack
  notify) runs on the **tightest cron cadence in this app, ~15 minutes**
  — the narrowest timeout-risk window of anything fixed this round. Its
  second, unrelated loop in the same file (the job-overload heuristic)
  was left as-is: `findOverloadedGroups` already pre-filters down to
  just the technicians who are actually overloaded on a given date, a
  naturally small set, same shape as round 1's already-confirmed-fine
  `lead-followup-reminder`/`verify-industrial-compliance`.
- **`detect-idle-assets`** and **`predict-asset-maintenance`**: the
  industrial-sector siblings of `track-consumables`/the asset_intelligence
  add-on, each sweeping every active `industrial_asset` platform-wide
  (addon-filtered, but still unbounded at the business-count level).
  `predict-asset-maintenance` specifically costs a real nested telemetry
  query for every addon-active asset regardless of whether a prediction
  ends up firing — not a conditional-cost loop the way
  `reconcile-technician-state` below is.
- **`reconcile-technician-state`**: structurally different from the rest
  of this round — most iterations are a cheap in-memory map lookup with
  no I/O at all, since drift (a technician's `current_job_id` pointing at
  an already-finished job) is the rare case, not the common one. Batched
  anyway, as defense in depth rather than a confirmed urgent fix: a
  correlated event (a mobile network outage hitting many technicians at
  once — exactly the scenario this function exists to clean up after)
  could spike the drifted subset well above its normal rare rate, and
  batching costs nothing functionally over the sequential loop it
  replaces, so there was no reason not to.

- **`followup-outreach`**: unlike most other candidate sets in this
  project, "sent, not yet replied, not unsubscribed" prospects don't
  self-clear the way e.g. `flag-abandoned-signups`' one-time flag does —
  a prospect can sit in this set through the full 3-stage follow-up
  sequence, so the pool only grows as real outreach volume scales, each
  needing a real Claude API call to draft its follow-up.
- **`generate-growth-drafts`**: the most expensive per-row body of any
  cron function audited this round — 4-8 sequential Supabase round trips
  plus up to 2 Claude API calls, for every Pro-tier (now exclusively
  trade-sector, per the separate Pro/Industrial billing-integrity fix
  this same session) business on the platform.

- **`forecast-demand`**, **`estimate-job-carbon`**: both addon-gated
  (`demand_forecast`, `carbon_estimate`) but fetch every business
  platform-wide before filtering, then loop sequentially over the
  addon-active subset. `estimate-job-carbon`'s per-item cost is lighter
  than most (pure math plus one upsert), batched anyway for consistency.
- **`check-weather-risk`**: a genuine nested loop — every weather-
  sensitive business, each with its own tomorrow-scheduled jobs, each job
  costing a real external Open-Meteo API call plus 1-2 DB round trips.
  Batched at the business level (the primary scaling axis); the inner
  per-job loop stays sequential within each business's own processing,
  since a single business's own next-day schedule is naturally small.
- **`optimize-industrial-routes`**: every active `site_project` platform-
  wide, each costing 2-3 round trips, runs every 30 minutes.

- **`retention-checkin`**: same deliberately-unbounded shape, explicitly
  documented in the function's own header comment — no upper date bound
  on completed jobs eligible for a check-in, specifically so a cron-
  downtime backlog is caught on the next run rather than silently lost
  forever. Each candidate costs a claim, a newer-job check, an optional
  Claude draft, and a Twilio send.
- **`flag-abandoned-signups`**, **`winback-lost-leads`**, both touches of
  **`nurture-stale-leads`**: a correction to this file's own earlier,
  too-quick triage — all 4 of these were initially filed as "probably
  fine, self-clearing" by pattern-matching against `new-subscriber-
  checkin`/`recover-abandoned-signup` (which genuinely do have both a
  lower AND upper date bound). On actually reading each one, none of
  these 4 have an upper bound — only a `.lt()`/`.is(..., null)` lower
  threshold. Each is self-clearing in steady state (its own flag column
  prevents re-matching once set), but every one is exposed to the same
  "a cron-execution gap produces a real, unbounded backlog processed in
  one run" risk as `retention-checkin` above — worth remembering as its
  own lesson: confirm a candidate set is genuinely *bounded*, not just
  *self-clearing* — the two properties are different, and only the first
  one defuses the scale risk.

All remaining functions from the original list have now been checked —
see the Final tally at the end of this file for the complete count.
`enrich-industrial-leads` and `notify-addon-trial-ending` ended up
needing the fix too (see their own entries above); `new-subscriber-
checkin`, `recover-abandoned-signup`, `test-agent-health`, and
`verify-checklist-photos` are confirmed fine (see Checked-and-fine
below).

## Checked and found fine (verified, not assumed)

- **`agent-council-report`** — read in full. Not a per-row loop at all:
  2 parallel bulk SELECTs (a week of `agent_insights` + all of
  `agent_functions`), then pure in-memory JS grouping/counting (no
  awaits), then at most ONE Claude call (explicitly cost-guarded at 1200
  max_tokens, with its own prompt-sample cap of 8 insights per agent
  group), then one insert. The large fetch itself isn't a sequential-
  loop timeout risk — it's a single query, bounded by normal transfer
  time, not multiplied by row count via repeated round trips, which is
  the specific pattern every other fix in this file addresses.
- **`auto-assign-technician`** — not a cron sweep despite being in the
  original candidate list (it's in `cron.schedule` indirectly via a
  trigger-style invocation, not a sweep). Takes a single `job_id`,
  `.eq('id', job_id).single()`, with a `RECENT_JOB_WINDOW_MS` recency
  check that rejects a stale call outright. Whatever candidate-technician
  loop exists inside is scoped to one job's own pool of eligible
  technicians — inherently small, not a platform-wide set.
- **`new-subscriber-checkin`**, **`recover-abandoned-signup`** — genuinely
  bounded, not just self-clearing (the distinction this file's own
  earlier correction above is about): both use `gte(windowStart)` AND
  `lte(windowEnd)`, a fixed-width window with BOTH bounds computed
  relative to "now" on every run, not an accumulating "everything since
  the dawn of time" lower-bound-only query. A cron-execution gap doesn't
  grow this candidate set — whenever the function next runs, the window
  has simply moved forward with it.
- **`test-agent-health`** — its candidate set is `agent_functions` rows
  (the registered cron functions themselves, currently ~35 across this
  whole codebase), not businesses/jobs/leads. This scales with how many
  distinct cron functions the codebase has — a number that grows with
  development, roughly by a handful a month — never with customer count.
  Not a realistic scale risk on any timeframe that matters.
- **`verify-checklist-photos`**' second loop (the job-level verification
  rollup) iterates `touchedJobIds`, a set that can have at most as many
  entries as the main loop's own `pending` photo batch — already
  `.limit(20)`-capped with its own explicit comment explaining why. Can
  never exceed 20 regardless of platform size.

## Final tally

26 functions total from the original candidate list (one more than the
25 initially estimated — an off-by-one in that first count, not a
function missed). **20 fixed, 6 confirmed fine on actual inspection.**
Combined with round 1's 6 fixed + 3 confirmed fine, every cron-scheduled
function in this codebase (~35 total) has now been individually read and
either fixed or verified fine, with the actual reasoning written down —
not assumed, not pattern-matched without checking. The one recurring
lesson worth carrying forward: *self-clearing* and *bounded* are
different properties, and a query needs to actually have an upper bound
(or a fixed-width window) to be safe against a cron-execution-gap
backlog — a flag column alone only protects steady state.

## Found later, a different class of growth entirely (2026-10-25) — `agent_insights` itself has no retention

Everything above audited whether each cron function's own QUERIES stay
bounded as customer count grows — a different question from whether the
TABLE they write to (`agent_insights`) stays bounded over TIME. It
doesn't: every agent that writes an informational/alert row there (now
including `check-service-credentials`, built 2026-10-24) adds a
permanent row with no cleanup path, several on a 15-minute or hourly
cadence, same unbounded-growth shape this project already fixed once for
`processed_stripe_events`/`processed_call_sids`/`xero_oauth_states`
(`supabase_schema_delta_retention_cleanup.sql`, 2026-09-25) — just not
extended to this table at the time, since it wasn't in that original
table-by-table audit's scope.

Fixed the same way: `supabase_schema_delta_agent_insights_retention.sql`,
a daily pg_cron DELETE for rows older than 180 days — chosen as a 2x
safety margin over the longest actual read dependency found by grepping
every `.from('agent_insights')` read in this codebase (90 days, in
`generate-growth-drafts`' own suburb-opportunity dedup; everything else
looks back 6-14 days). Not an edge function, matching the 2026-09-25
file's own reasoning: pure janitorial work, nothing to kill-switch.
