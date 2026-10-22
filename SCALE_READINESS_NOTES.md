# Minerva — Scale Readiness Notes

Started 2026-10-08, prompted by "capable of serving hundreds of customers"
becoming an explicit bar for the first time (previously this was a pre-revenue,
~1-business project). Same spirit as `SECURITY_NOTES.md` — a dated, honest
record of what's been checked, fixed, and deliberately deferred, so a future
pass doesn't have to re-derive this from scratch or guess what "already
considered" means.

## Fixed 2026-10-08

Found via a dedicated background audit (prompted by the above), each
verified against the actual code before fixing, not taken on the audit's
word alone.

- **2 missing indexes** (`supabase_schema_delta_scale_readiness_indexes.sql`,
  CONFIRMED LIVE 2026-10-23 — run directly in the SQL Editor, "Success. No
  rows returned", found sitting unconfirmed during a sweep of every "not
  yet applied" marker across this project's tracking docs): `detect-wasted-trips`' every-15-minute
  platform-wide scan of `jobs` filtered on `status = 'scheduled'` (the single
  most common job status for any business with upcoming work) had no
  supporting index; `DispatcherView.jsx`'s payroll-hours query against
  `technician_locations` (the fastest-growing table in the schema — one row
  per active technician every 15 seconds) filters by `business_id` + a
  `recorded_at` range with only a `(technician_id, recorded_at)` index to
  lean on, which doesn't help a business-wide range scan.
- **`reconcile-billing` and `update-technician-workload`**: both looped
  fully sequentially over every business/technician on the platform, each
  iteration costing 2-4 sequential round-trips. At hundreds of businesses
  or thousands of technicians, risked exceeding the Edge Function
  wall-clock timeout partway through — silently never checking whichever
  rows sorted later that day, with no error signal. `reconcile-billing` is
  the more serious of the two: it's the one function whose entire job is
  keeping Stripe billing numbers correct. Fixed with a new shared
  `_shared/batch.ts` `chunk()` helper — both now process in
  bounded-concurrency batches of 20 instead of either fully sequential or
  fully unbounded parallel.
- **`daily-digest`**: same sequential-outer-loop shape (each business's own
  7 queries were already parallelized internally, but the loop across
  businesses wasn't) — this is the function most real customers will
  actually see every single day, so the same fix matters here even more
  for product experience than for a timeout risk. Also added per-business
  error isolation, which the original never had at all (one business's bad
  data throwing would have silently aborted every business sorted after it
  that day).
- **`AdminConsole.jsx`'s `loadBusinesses()`**: fired one `technicians` query
  per business (N+1) on every admin page load and after every tier
  override. Fixed to one batched `.in(...)` query — the exact same pattern
  the same file already uses correctly for `roi_proposals` in
  `loadBigAccounts()`.
- **`DispatcherView.jsx`'s `job_assignments` query**: had no job-status
  filter at all despite its own comment claiming it was scoped to
  "currently active/scheduled jobs" — fetched every crew assignment ever
  made for the business. Confirmed zero behavior change from fixing this
  (the extra rows were fetched into state but never looked up, since
  `jobCrew` is only ever read for a job already in the separately-fetched,
  already-correctly-scoped `jobs` array) before touching it.
- **Two operator-facing unbounded lists** (`AdminConsole.jsx`'s
  `loadRequests()`/`loadProspects()`): added a generous 500-row safety
  bound. Low-risk to bound (internal/operator data, not a paying customer's
  own records) and `outreach_prospects` specifically is about to start
  growing fastest once outreach actually ramps up.

## Checked and found fine (verified, not assumed)

- **Realtime subscription scoping** — every `postgres_changes` subscription
  (`DispatcherView.jsx`, `TrackingView.jsx`, `TechnicianView.jsx`) carries a
  server-side `filter` (`business_id=eq.X` or `id=eq.X`), evaluated by
  Supabase Realtime before relaying to each client. No shared/unscoped
  channel exists anywhere. Safe at any business count.
- **`rate_limit_counters` key design** — every call site
  (`ai-intake-chat`, `voice-intake-agent`, `client-support-chat`,
  `send-setup-sms`, `technician-login`) keys naturally by business/job/
  technician/IP, so concurrent requests from different callers land on
  different rows and never contend. Safe at hundreds of concurrent
  businesses.
- **FK/`business_id` indexing** — already comprehensive
  (`supabase_schema_delta_fk_indexes.sql` + `_round2.sql`). The real gaps
  were secondary filter columns layered on top, addressed individually
  above.
- **`lead-followup-reminder`** — its candidate query
  (`next_action_at <= now AND next_action_reminded_at IS NULL`) is
  naturally self-limiting: bounded by how many dispatchers are actively
  using follow-up reminders right now, not by total historical lead
  volume, and already-reminded leads are permanently excluded. Doesn't
  scale with business count the way an unfiltered historical query would.
- **`verify-industrial-compliance`** — same shape: its candidate query
  (`acknowledged_at IS NULL AND escalated_at IS NULL`, plus an age cutoff)
  only ever holds currently-unresolved incidents, not all incidents ever.
- **`run-custom-workflows`'s overdue-invoice sweep** — double-bounded: the
  business list itself is pre-filtered to businesses with an *active,
  opted-in* `invoice.overdue` custom workflow (most businesses won't have
  configured one at all — this is a power-user feature, not default-on),
  and within that small set, invoices are further filtered to
  not-yet-notified ones only. Doesn't scale with total business count.

## Fixed 2026-10-08, continued — the 3 industrial-sector cron functions

Originally deferred (see the superseded note this replaces, below the
rule) because the industrial sector had zero real customers and the
`chunk()` pattern was unproven. Closed out the same day once
`reconcile-billing`/`update-technician-workload`/`daily-digest` had all
landed cleanly: `detect-safety-hazards` (platform-wide
`site_projects.status='active'` scan, every 15 min, with a nested
per-site `site_checkins` query), `sequence-handoffs` (every 15 min,
nested per-completion query, candidate set already time-windowed to the
last hour), `industrial-conductor` (hourly cron sweep + a
single-lead direct-invocation mode, the latter an intentional no-op
pass-through through the same batching code since it only ever has one
leadId). Same pattern, same per-function verification (full manual
trace + brace/paren balance check, no Deno CLI available locally).

**Superseded note, kept for the historical record of the original
reasoning**: ~~4 industrial-sector cron functions still have the same
unbounded-loop shape as the ones fixed above... the industrial sector
has zero real customers today, so the actual risk right now is scanning
an empty table every cycle, not a timeout... revisit then rather than
spending effort on it blind today.~~ Revisited same-day instead, once
"blind" no longer applied.

## Deliberately deferred, with reasoning

- **Business-owner-facing unbounded historical lists**:
  `DispatcherView.jsx`'s `invoices`/`review_requests`/`marketing_drafts`
  queries in `loadAll()`, and `IndustrialDispatcherView.jsx`'s
  `industrial_leads`/`site_projects`/`industrial_assets`/
  `safety_incidents`/`corrective_actions`/`client_verification_packages`
  queries, all grow unbounded with a business's own job/lead/invoice
  history and have no `.limit()`. Unlike every fix above, these are
  deliberately **not** touched: a business that's been live a year or two
  will have a slower dispatcher page load, which is a real problem worth
  solving — but blindly adding `.limit()` risks silently hiding a real
  business owner's own real invoice/lead/incident from them, a worse
  mistake than the slowness itself. This needs actual pagination or a
  search/filter UI, not a quick cap, and deserves its own scoped pass
  rather than being rushed alongside the lower-risk fixes above.
  **Re-verified 2026-10-10** while checking today's own new code
  (the technician site-tracking and verification-package fixes) against
  this exact bar before shipping it — independently re-arrived at the
  same conclusion rather than assuming it still held, and extended the
  list: `IndustrialDispatcherView.jsx`'s new `technician_incidents`
  query (today's own addition, "Field reports") has the identical shape
  and belongs on this list too. Also tried, then reverted, the one fix
  in this group that looked obviously safe by exact precedent —
  filtering `industrial_leads` to active statuses only, mirroring
  `DispatcherView.jsx`'s own `leads` query
  (`.in('status', ['new','contacted','quoted'])`) exactly, which trade's
  `leads`/`jobs` tables already do safely. Caught before shipping, by
  checking every real usage first rather than trusting the precedent
  alone: unlike trade's lead→job conversion (one atomic action,
  `convertLead()` creates the job and flips lead status together,
  confirmed in `DispatcherView.jsx`), industrial's lead→site link is a
  separate, later, manual step — `addSite`'s own "Linked lead" dropdown
  reads straight from the same `leads` array, and the single most
  realistic case (linking a brand-new site to the lead that was *just*
  converted) is exactly the row a naive active-status filter would hide
  from that dropdown right when it's needed. Worth remembering as its
  own lesson: an exact-looking precedent (same table shape, same kind of
  terminal status) can still fail if a DIFFERENT part of the UI reads the
  same array for a different purpose than the one the precedent was
  built for — check every real call site of the data, not just the one
  you're trying to fix.
- **`technician_locations` has no retention/pruning cron**, unlike the 3
  tables `supabase_schema_delta_retention_cleanup.sql` already prunes
  (`xero_oauth_states`, `processed_stripe_events`, `processed_call_sids`).
  It's the single fastest-growing table in the schema (one row per active
  technician every 15 seconds while tracking) and will eventually matter
  for storage/vacuum cost at real scale — but unlike those 3 purely
  internal idempotency logs, this table's rows are genuinely meaningful
  business records (Dispute Pack GPS evidence, payroll-hours
  calculations), so how long to retain them is a product/legal decision
  for the business owner to make, not something to decide and implement
  unilaterally. Flagged here for a future conversation about a retention
  window, not implemented.
