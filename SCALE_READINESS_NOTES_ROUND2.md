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

7 of the 25 functions from the original list fixed so far; 18 remain to
check (`agent-council-report`, `check-weather-risk`, `enrich-industrial-
leads`, `estimate-job-carbon`, `flag-abandoned-signups`, `followup-
outreach`, `forecast-demand`, `generate-growth-drafts`, `new-subscriber-
checkin`, `notify-addon-trial-ending`, `nurture-stale-leads`, `optimize-
industrial-routes`, `recover-abandoned-signup`, `retention-checkin`,
`winback-lost-leads`, plus `auto-assign-technician`/`test-agent-health`/
`verify-checklist-photos`, the last of which already looks correctly
bounded on first read — see Checked-and-fine below once confirmed).
