# Minerva — Deployment Status

**Everything in this file's original checklist is now DONE and confirmed
live.** This file is kept only as a historical record of what shipped and
when — do not treat anything below as still-pending work. For the current
outstanding (non-code) manual steps, see the "Still outstanding" section at
the bottom.

## Confirmed live, in order

- **2026-09-02**: the production-outage-class missing-GRANT bug (all 25 core
  tables + 3 Agent Ops tables had RLS policies but no underlying
  `GRANT ... TO anon`) — fixed via direct SQL. 21 of 23 corrupted pg_cron
  Authorization headers — fixed by recreating those jobs with the real key.
- **2026-09-02**: all 4 SQL delta files (agent_infra, agent_phase3,
  agent_council, agent_expansion/industrial/agent_cron from the prior batch)
  — all ran successfully.
- **2026-09-02**: all 42 edge functions confirmed deployed via
  `supabase functions list` (13 Track A/B + `test-agent-health` + 12
  Phase2/3 redeploys + `agent-council-report` + the `ai-intake-chat`
  no-fallback bug fix redeploy).
- **2026-09-02**: 2 new cron jobs scheduled (`test-agent-health-15min`,
  `agent-council-report-weekly`). Total cron jobs: 23, all confirmed healthy.
- **2026-09-02**: first-ever full git commit + push of the whole accumulated
  build (`0232a49`), including the Phase 5 Agent Ops dashboard frontend.
- **2026-09-03**: `businesses.ingestion_key` column added,
  `harvest-industrial-leads` / `monitor-asset-telemetry` redeployed with the
  `X-Ingestion-Key` shared-secret auth gate now live (closes the previously
  documented open-webhook gap — see `SECURITY_NOTES.md`).
- **2026-09-03**: Stripe secret key rolled (had been exposed in a
  screenshot), Supabase secret updated to match.
- **2026-09-03**: 10 schema-drift columns across 5 tables (defined in
  `supabase_schema.sql`'s evolution but never actually applied to the live
  DB) found via a systematic live-vs-file diff and fixed — see
  `minerva_setup_progress.md` memory for the full column list. RLS+grants
  and all 23 cron jobs re-verified clean across all 28 live tables.
- **2026-09-03**: 3 "orphaned backend feature" gaps (data computed by an
  edge function but never shown in the frontend) found and fixed:
  `technician_incidents` accountability log, Watchtower AI checklist-photo
  verification badges, `asset_telemetry_events` history. Also surfaced
  `invoices.reminder_count`. Committed (`2dcb32d`) and pushed to
  `origin/main`.
- **2026-09-03**: confirmed via code audit that the Agent Ops kill-switch
  (`agent_functions.enabled`) is fully wired — all 11 gated functions
  actually check it and skip early when disabled. `SECURITY_NOTES.md`
  updated to reflect this (previously said "not yet read by any function").
- **2026-09-04**: Minerva Max add-on tier (7 add-ons, upsell nudges, trials)
  deployed live end-to-end — SQL delta run, 6 edge functions redeployed,
  committed and pushed (`7a9506c`).
- **2026-09-04 ("free time" audit pass)**: systematic 3-pronged audit
  (technician-phone flows, cross-agent/cross-system links, docs-vs-code
  accuracy) found and fixed a real defense-in-depth gap — `draft-quote`,
  `send-quote-sms`, and `estimate-job-carbon` were missing server-side
  Minerva Max addon checks despite being frontend-gated. Also built:
  SMS to technician on job assignment/reassignment (new
  `send-job-assignment-sms` function, wired into `assignJob()` in
  `DispatcherView.jsx` and into `auto-assign-technician`); technician-facing
  burnout/workload banner (mirrors the existing 55-hour dispatcher-side
  threshold); invoice client-SMS-failure visibility (new
  `invoices.client_sms_failed` column, dispatcher + technician badges,
  replaces a previously-silent failure); GPS offline-queue auto-flush on
  app load (previously only flushed on the `online` event or next GPS
  tick); a "Show recent run log" panel for Custom Workflows in
  `DispatcherView.jsx` (surfaces the previously-write-only `workflow_runs`
  table); `agent_functions` registry rows + `record_agent_run()` calls
  added for 6 functions that were deployed/scheduled but invisible to
  `test-agent-health` (`predict-asset-maintenance`, `detect-idle-assets`,
  `estimate-job-carbon`, `forecast-demand`, `agent-council-report`,
  `test-agent-health` itself); 3 stale README claims corrected (CSV export
  and "+ Add" technician were documented as Pro-tier-only but have no tier
  gate in code; the edge-functions file listing was missing ~14 newer
  functions). Pushed to `origin/main` same day (`537fef3`) using a fresh
  one-time GitHub PAT.
- **2026-09-04 (continued, "do both" — deploy track + keep-building
  track)**: pushed `537fef3`. Then, since no fresh Supabase PAT was
  supplied this round, kept building the previously-deferred audit
  findings instead of blocking on it:
  - **Crew-splitting server-side enforcement** — turns out this app has no
    Supabase Auth (`auth.uid()`) anywhere by design (see
    `supabase_schema.sql`'s RLS header note), so a real RLS policy
    wouldn't have added any actual enforcement. Used a Postgres
    `BEFORE INSERT` trigger on `job_assignments` instead
    (`enforce_crew_splitting_addon()`) — the one place that's enforced
    regardless of which client performs the insert. `addCrewMember()` in
    `DispatcherView.jsx` now surfaces the trigger's error if it fires.
  - **Checklist-photo upload retry logic** — `uploadChecklistPhotos()` in
    `TechnicianView.jsx` now retries each photo up to 3 times (0s/1s/3s
    backoff) instead of a single silent attempt; a photo that still fails
    surfaces a dismissible warning banner (`checklistPhotoWarning`) instead
    of only a `console.error`.
  - **No-show-to-technician SMS** — `detect-wasted-trips` now also texts
    the technician (not just the client + Slack) so they know not to keep
    waiting on-site or re-attempt a job that's already been logged as a
    no-show and offered a reschedule.
  - **Invoice void (soft-delete) audit trail** — new "Void" button next to
    "Mark paid" in the Invoices tab, prompts for a reason, sets
    `invoices.status = 'void'` + `voided_at`/`voided_reason`. Turns out
    there was no delete RLS policy on `invoices` at all, so a hard delete
    was never actually reachable via the anon key either way — this adds
    the missing *correction* path rather than a delete capability.
    `chase-unpaid-invoices` already only queries `status = 'unpaid'` so
    voided invoices stop being chased for free; `daily-digest`'s revenue
    totals now explicitly exclude voided invoices too.
  - New delta additions (same file): the `enforce_crew_splitting_addon`
    trigger, `invoices.voided_at`, `invoices.voided_reason`.
  - `npm run build` verified clean. Committed locally as `edf5aa2`.
- **2026-09-05**: `edf5aa2` pushed to `origin/main` using a fresh one-time
  GitHub PAT. `supabase_schema_delta_operational_fixes.sql` run live via the
  Supabase Management API using a fresh one-time PAT and verified: all 3
  new `invoices` columns (`client_sms_failed`, `voided_at`, `voided_reason`)
  exist, all 6 new `agent_functions` rows exist, and
  `trg_enforce_crew_splitting_addon` exists on `job_assignments`. All 10
  touched/new edge functions redeployed and confirmed `ACTIVE` via
  `supabase functions list`: `draft-quote`, `send-quote-sms`,
  `estimate-job-carbon`, `send-job-assignment-sms` (brand new — first
  deploy), `auto-assign-technician`, `predict-asset-maintenance`,
  `detect-idle-assets`, `check-credential-expiry`, `detect-wasted-trips`,
  `daily-digest`. Code and live DB/functions are now fully back in sync —
  the entire "free time" audit pass (both the original findings and the
  "do both" follow-up batch) is confirmed live end-to-end.

- **2026-09-05 (industrial/B2B track + Agent Ops audit pass)**: systematic
  audit of the 10 base industrial functions (`industrial-conductor`,
  `harvest-industrial-leads`, `enrich-industrial-leads`,
  `optimize-industrial-routes`, `track-consumables`,
  `detect-safety-hazards`, `sequence-handoffs`,
  `package-client-verification`, `verify-industrial-compliance`,
  `monitor-asset-telemetry`) found they all already had `agent_functions`
  rows live (`agent='core', enabled=true`, no SQL delta needed) but none of
  the function code actually read/wrote that infra. Fixed:
  - All 10 now call `record_agent_run()` on success and in the error catch,
    matching the established pattern from `detect-idle-assets` /
    `agent-council-report`.
  - Kill-switch (`agent_functions.enabled` early-exit) added to the 5 that
    are pure cron sweeps safe to disable mid-run: `optimize-industrial-routes`,
    `track-consumables`, `detect-safety-hazards`, `sequence-handoffs`,
    `verify-industrial-compliance`. The other 5 deliberately excluded,
    matching the existing frontend `KILL_SWITCH_GATED_FUNCTIONS` design
    distinction (event-driven/direct-invoke/webhook functions aren't
    kill-switch-gated even when they get health tracking):
    `industrial-conductor`, `harvest-industrial-leads` (webhook, `--no-verify-jwt`),
    `enrich-industrial-leads` (direct-invoke), `package-client-verification`
    (direct-invoke), `monitor-asset-telemetry` (webhook, `--no-verify-jwt`).
  - `DispatcherView.jsx`'s `KILL_SWITCH_GATED_FUNCTIONS` array extended from
    11 to 16 entries so the new toggles actually show up in the Agent Ops
    dashboard.
  - New `agent_insights` writes (`insight_type: 'low_stock'` /
    `'safety_incident'`) added to `track-consumables` and
    `detect-safety-hazards` — both already have check-before-flag
    suppression so this won't spam the weekly `agent-council-report`.
    Deliberately NOT added to `sequence-handoffs`, which has no such
    suppression and re-nudges every 15-min cycle for the same open event.
  - `IndustrialDispatcherView.jsx`: site check-in history (expandable panel,
    lazy-loaded `site_checkins` query, mirrors the existing asset-events
    pattern), "Mark restocked" button (clears
    `consumables_items.reorder_requested_at`), and a manual "+ Report
    incident" form (inserts into `safety_incidents` directly, severity
    `warning`/`hazard` per the real schema).
  - `README.md` corrected: `detect-idle-assets` / `predict-asset-maintenance`
    noted as living under the `asset_intelligence` add-on rather than the
    base industrial track; base industrial functions now documented as
    kill-switch/health-tracked where applicable.
  - `npm run build` verified clean. Committed locally — not yet redeployed
    or pushed, needs fresh Supabase + GitHub PATs (see below).
- **2026-09-05 (PWA/offline mode for TechnicianView)**: the item previously
  listed below as deliberately deferred — built this round as part of the
  same "all" instruction. `public/manifest.json` (installable at
  `/tech`, standalone display, SVG icon), `public/sw.js` (network-first
  navigation with cached-shell fallback for `/tech`, cache-first with
  background refresh for static assets, Supabase/Mapbox requests untouched
  so API calls always hit the network), registered from `main.jsx` in
  production builds only. `index.html` links the manifest/icon/theme-color.
  `TechnicianView.jsx` gained an install banner (`beforeinstallprompt`
  capture + custom button, dismissible via localStorage; simply never
  appears on browsers that don't fire the event, e.g. iOS Safari). This is
  additive to the existing GPS-queue/localStorage offline handling, not a
  replacement — real data still requires a live connection, this just lets
  the app shell itself load with none. `npm run build` verified the
  manifest/sw/icon land in `dist/`. Committed locally, not yet pushed.

- **2026-09-05 (confirmed live)**: fresh Supabase + GitHub PATs supplied.
  All 10 industrial functions redeployed and confirmed `ACTIVE` via
  `supabase functions list`. `ee8f1e6` and `e11d729` pushed to
  `origin/main`. Both the industrial/B2B audit-pass batch and the PWA batch
  are now fully live end-to-end.

- **2026-09-05 (perf + Stripe/billing/growth audit pass)**: route-based
  `React.lazy()` code-splitting in `App.jsx` — every page is now its own
  chunk instead of one shared bundle (586KB → 168KB main chunk;
  `TechnicianView` down to a standalone ~25KB chunk, notable since it's
  opened from an SMS link, often on mobile). Then a fresh Explore-subagent
  audit of Stripe/billing + AI intake/lead-gen, self-verified against
  source before building, found and fixed:
  - `launch-ad-campaign` / `send-growth-message`: added an atomic
    conditional-update claim (`UPDATE ... WHERE status='pending'`) before
    spending real ad budget / sending real SMS — closes a TOCTOU race where
    two rapid clicks or a retried request could both pass the earlier plain
    status check. `send-growth-message` also now reverts to `'failed'`
    (instead of stranding at a new transient `'sending'` status) if the
    send itself throws.
  - `reconcile-billing`: self-heals businesses stuck with `stripe_sub_id`
    set but `stripe_sub_item_id` still null (a failed one-shot fetch inside
    `stripe-webhook` at checkout time) — previously such a business was
    silently excluded from reconciliation forever.
  - `DispatcherView.jsx` / `TechnicianView.jsx`: new cancelled-subscription
    banner once `stripe-webhook` sets `subscription_tier='cancelled'` —
    previously no UI ever surfaced this state to the owner or technicians.
  - `generate-growth-drafts`: now writes an `agent_insights` row when a
    weekly run skips businesses because `ANTHROPIC_API_KEY` is missing,
    instead of silently reporting `drafted: 0` with no explanation.
  - `enrich-industrial-leads`: new `enrichment_nudge_sent_at` column
    (`supabase_schema_delta_enrichment_nudge.sql`) so the daily cron sweep
    nudges Slack once per unenriched lead instead of re-nudging the same
    lead every single day forever.
  - Findings deliberately not built: per-add-on Stripe billing wiring (out
    of scope, a separate integration project — already tracked below),
    a theoretical duplicate-draft edge case (self-correcting via human
    review), and a sales-transparency question (not an engineering bug).
  - `npm run build` verified clean. Committed locally (`ce65d5d`) — not yet
    pushed or deployed, needs fresh Supabase + GitHub PATs (see below).

- **2026-09-05 (confirmed live)**: fresh Supabase + GitHub PATs supplied.
  `ce65d5d` and `b324d65` pushed to `origin/main`.
  `supabase_schema_delta_enrichment_nudge.sql` run live via the Supabase
  Management API and verified: `industrial_leads.enrichment_nudge_sent_at`
  exists. All 5 touched edge functions redeployed and confirmed `ACTIVE`
  via `supabase functions list`: `reconcile-billing`, `launch-ad-campaign`,
  `send-growth-message`, `generate-growth-drafts`,
  `enrich-industrial-leads`. Code, live DB, and live functions fully in
  sync — the perf + Stripe/billing/growth audit batch is now live
  end-to-end.

- **2026-09-05**: "do all you can" multi-tenant-readiness batch — built,
  tested, and committed locally (not yet deployed live, needs fresh PATs):
  1. **Onboarding honesty + orphaned-signup cleanup**: `SuccessPage.jsx`'s
     false "you'll receive an email before any charge" claim corrected
     (no email infra existed to back it). New `send-email` function
     (Resend-based, gated on optional `RESEND_API_KEY`, no-ops cleanly if
     unset) wired into `stripe-webhook`'s `checkout.session.completed` for
     a real welcome email once configured. New `flag-abandoned-signups`
     daily cron flags (via new `agent_insights` rows + new
     `businesses.abandoned_flagged_at` column) — but deliberately does
     NOT delete — businesses stuck 48+ hours with no completed Stripe
     checkout, for human review.
  2. **Technician PIN collision fix**: new DB-level `unique` constraint on
     `technicians.pin` (`supabase_schema_delta_pin_unique.sql`) plus a new
     shared `insertTechniciansWithPinRetry()` helper (retries on Postgres
     23505) used by both `Onboarding.jsx` and `DispatcherView.jsx`'s Add
     Technician modal.
  3. **Business owner login** (additive, app-layer gate only — RLS
     unchanged, still `using (true)` everywhere, deliberately, see
     `supabase_schema_delta_owner_auth.sql`'s header for why a full RLS
     rewrite was judged too risky to bundle in blind): new
     `businesses.owner_user_id` column, new `/login` page (Supabase Auth
     magic link, no password/new external service needed), new
     `RequireBusinessAuth.jsx` wrapping `/dispatch/:businessId` and
     `/industrial/:businessId`, with auto-claim for existing pilot
     businesses on first login matching `contact_email`.
  4. **Internal admin console**: new `/admin` route (`AdminConsole.jsx`),
     gated by a `VITE_ADMIN_EMAILS` allowlist checked against the same
     Supabase Auth session. Cross-business list (tier/Stripe status/tech
     count/last activity), manual tier override, and a support inbox
     backed by new `support_requests` table + a new "Contact support" form
     (`ContactSupportModal.jsx`) wired into both `DispatcherView.jsx` and
     `TechnicianView.jsx`.
  5. **Testing/lint/CI baseline**: Vitest (13 tests covering `utils.js`'s
     pure functions + the new PIN-retry helper), ESLint 8 baseline config,
     GitHub Actions workflow (`.github/workflows/ci.yml`) running
     lint+test+build on every push/PR to `main`. All verified green
     locally before commit.
  6. **Sentry scaffold**: `src/sentry.js`, gated on optional
     `VITE_SENTRY_DSN` — no-op until the user creates a free Sentry
     project and sets the DSN.

  New SQL deltas to run (in any order, each is independent/additive):
  `supabase_schema_delta_enrichment_nudge.sql` (already run, see above),
  `supabase_schema_delta_abandoned_signups.sql`,
  `supabase_schema_delta_pin_unique.sql` (⚠️ run its pre-check query first
  — see the file's own header — before applying, in case a PIN collision
  has already happened live), `supabase_schema_delta_owner_auth.sql`,
  `supabase_schema_delta_support_requests.sql`. Then
  `supabase_schema_delta_abandoned_signups_cron.sql` (after both the DDL
  delta above AND deploying `flag-abandoned-signups` are done).
  New edge functions to deploy: `send-email`, `flag-abandoned-signups`.
  Existing function to redeploy: `stripe-webhook` (welcome-email wiring).
  Manual, non-code step still needed: set `VITE_ADMIN_EMAILS` in the
  frontend's env (comma-separated list of staff emails) before `/admin` is
  usable by anyone.

## Not yet deployed live

Nothing currently pending on the code/DB side.

## Confirmed live (2026-09-06, continued — Agent-OS kill-switch/health-tracking rollout)

- Pushed `15dd193` to `origin/main` using a fresh one-time GitHub PAT
  (`8a90183..15dd193`, includes `429c500` + `15dd193`). In response to
  "make [the agents] the best possible... as possible", audited all 56
  edge functions for `record_agent_run` + `agent_functions.enabled`
  coverage and closed every remaining gap on genuinely autonomous/cron
  functions:
  - Added the `agent_functions.enabled` kill-switch check (matching the
    canonical pattern already used by `check-inventory-levels`) to 12
    functions that had `record_agent_run` but no kill-switch:
    `auto-assign-technician`, `check-credential-expiry`, `detect-idle-assets`,
    `enrich-industrial-leads`, `estimate-job-carbon`, `flag-abandoned-signups`,
    `industrial-conductor`, `launch-ad-campaign`, `predict-asset-maintenance`,
    `send-growth-message`, `harvest-industrial-leads`, `monitor-asset-telemetry`.
  - Added full wiring (kill-switch check + `record_agent_run` on both the
    success and error paths) to 3 functions that had neither:
    `verify-checklist-photos`, `daily-digest`, `run-custom-workflows`.
  - Deliberately left unchanged: `reconcile-technician-state` (self-healing
    recovery function, no kill-switch by design), `package-client-verification`
    and `ai-intake-chat` (human-triggered/real-time, not cron agents).
  - Lint clean, 16/16 frontend tests pass, build clean.
- **All 14 functions redeployed live to Supabase's edge runtime** using a
  fresh one-time Supabase PAT, via the Management API (no `supabase` CLI
  installed in this environment). **Incident during rollout**: the first
  deploy attempt (`auto-assign-technician`) used `PATCH
  /v1/projects/{ref}/functions/{slug}` with a raw JSON `body` field — the
  API accepted it and bumped the version, but produced a broken bundle
  (`BOOT_ERROR`, HTTP 503) for roughly a minute. This function is invoked
  synchronously by the `on_job_created_auto_assign` DB trigger on every new
  job, so any job created in that window would have failed to auto-assign.
  Caught immediately via a post-deploy OPTIONS smoke test (a habit worth
  keeping for every future function deploy in this project). Found the
  correct method — `POST /v1/projects/{ref}/functions/deploy?slug={slug}`
  with proper `multipart/form-data` (`metadata` JSON part +  `file` part)
  — redeployed and fixed it, verified via both an OPTIONS check and a real
  POST invocation (nonexistent job_id, so no side effects) that full logic
  runs correctly. Redeployed the remaining 13 functions with the corrected
  method, preserving each function's original `verify_jwt` setting, with an
  OPTIONS smoke test after every single one before moving to the next. All
  15 functions (14 batch + `auto-assign-technician`) confirmed `ACTIVE` via
  a final `GET /v1/projects/{ref}/functions` sweep.
  **Lesson for any future Management-API-based function deploy in this
  project: always use the multipart `/functions/deploy` endpoint, never the
  plain `PATCH /functions/{slug}` with a JSON body — the latter can silently
  corrupt the live bundle while still reporting success.**

## Confirmed live (2026-09-06, continued — technician incident reporting)

- Pushed `8a90183` to `origin/main` using a fresh one-time GitHub PAT
  (`d03845b..8a90183`). Contains: technician-side incident reporting.
  A full system-wiring audit (technician phone flow, all 29 cron-scheduled
  agent functions, Stripe/Twilio/Mapbox/Xero/Slack integrations) found
  everything else confirmed working end-to-end, except one genuinely
  half-built feature — `technician_incidents` (the "Crew Coordination
  accountability log") already had dispatcher-side UI (`DispatcherView.jsx`'s
  `addIncident()`) and its RLS policy already allowed
  `reported_by: 'technician'`, but no technician-side UI ever wrote to it —
  a one-way "dispute log". Added a "Report an issue" button + modal in
  `TechnicianView.jsx` (category: note/dispute/near_miss/commendation,
  works with or without a current job) and updated `DispatcherView.jsx`'s
  incident log line to show who reported it. No schema change needed — the
  table/RLS/grants already supported this. Plain frontend code — live via
  Vercel auto-deploy from this push, no separate function/SQL deploy step.
  Lint clean, 16/16 tests pass, build clean.

## Confirmed live (2026-09-06, continued — testing + RLS live-verification pass)

- Pushed `d03845b` to `origin/main` using a fresh one-time GitHub PAT
  (`6b1e665..d03845b`). Contains: `classifyPriority()`/`URGENT_KEYWORDS`
  moved from `ContactSupportModal.jsx` into `utils.js` (exported) for unit
  test coverage, consistent with this project's existing Vitest-covers-
  utils.js convention. 3 new tests added (`utils.test.js`), 16/16 passing.
  Plain frontend change — live via Vercel auto-deploy from this push, no
  separate function/SQL deploy needed.
- **DELETE-RLS-policy audit live-verified** using a fresh one-time Supabase
  PAT (Management API query against `pg_policies`, not just the SQL files
  this time — see below for why that distinction matters in this project).
  Confirmed the file-based audit's conclusion was correct: `job_assignments`,
  `custom_workflows`, and `review_requests` (the 3 tables with anon-key
  `.delete()` call sites in the frontend) all have an unrevoked live
  `for all using (true) with check (true)` policy each
  (`anon all job_assignments` / `anon all custom_workflows` /
  `anon all review_requests`, `cmd: ALL`). No DELETE-policy gap exists.
  This closes the residual-risk caveat flagged after the file-based-only
  pass — live DB state now confirmed to match the SQL files for this
  specific check (past bugs in this project, e.g. the `businesses` and
  `checklist_photos` UPDATE-policy gaps, were exactly this kind of
  file-vs-live drift, so this was worth spending a token on to verify
  rather than trusting the file read alone).

## Confirmed live (2026-09-06, "make Minerva a fully functioning business" pass)

- Pushed `ef0224e` to `origin/main` using a fresh one-time GitHub PAT.
- `supabase_schema_delta_support_priority.sql` run live via the Supabase
  Management API and verified: `support_requests.priority` column exists
  (`text`, default `'normal'`).
- `create-billing-portal-session` deployed and confirmed `ACTIVE` via
  `supabase functions list`. All required secrets (`STRIPE_SECRET_KEY`,
  `APP_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_URL`) already existed — no new
  secrets needed, so the "Manage billing / Cancel" button in
  `DispatcherView.jsx` is fully live end-to-end: a business owner can now
  actually self-serve-cancel via the real Stripe Customer Portal for the
  first time since this app was built.
- The legal pages (`/terms`, `/privacy`, `/refund-policy`), the Onboarding
  agreement checkbox, the landing-page copy fix, and the AdminConsole
  support-triage UI are all plain frontend code with no separate deploy
  step — live the moment the Vercel build picks up `ef0224e` from
  `origin/main` (no manual action needed if Vercel's auto-deploy-on-push is
  configured, which prior session notes confirm it is).

Below is the original build-time entry, kept for the detailed record of
what each piece does and why (see the "Confirmed live" heading above for
deployment status):

- **2026-09-06 ("make Minerva a fully functioning business" pass)**: built,
  tested, and committed locally — needs fresh Supabase + GitHub PATs to go
  live:
  1. **Legal/compliance pages**: `/terms`, `/privacy`, `/refund-policy`
     (`TermsOfService.jsx`, `PrivacyPolicy.jsx`, `RefundPolicy.jsx`), drafted
     from the actual data flows and billing mechanics in this codebase (not
     generic boilerplate) — but explicitly **not lawyer-reviewed**, flagged
     as such in each file's own header comment. Linked from `LandingPage.jsx`'s
     footer and gated behind a required checkbox in `Onboarding.jsx`'s final
     step before "Start free trial" is clickable.
  2. **Self-serve billing cancellation (real gap closed)**: `stripe-webhook`'s
     own header comment said this was "promised on the pricing page" via
     `stripe_customer_id`, but no function or button ever actually opened
     the Stripe Customer Portal — "Cancel anytime" was marketing copy with
     no working mechanism behind it; a business could only cancel by asking
     support to do it manually. New `create-billing-portal-session` edge
     function + "💳 Manage billing / Cancel" button in `DispatcherView.jsx`'s
     sidebar, redirecting to the real Stripe-hosted portal for that
     business's `stripe_customer_id`. Cancelled-subscription banner copy
     updated to match. Uses the already-configured `STRIPE_SECRET_KEY` and
     `APP_URL` secrets, no new secrets needed.
  3. **Verified copy-accuracy fix**: `LandingPage.jsx`'s "Automatic text...
     when your tech is 15 minutes away" corrected — the actual trigger is
     `SMS_TRIGGER_KM = 2.0` (2km), not a time estimate; the "15 minutes" was
     only a hardcoded phrase inside the SMS text itself, not the real
     trigger condition. Found via a full customer-facing-copy audit pass
     (LandingPage/Onboarding/SuccessPage/TrackingView/InvoiceView/QuoteView/
     DisputeView/ClientHistoryView + README) — no other genuine overclaims
     found (everything else checked was accurate, including maxAddons.js's
     deliberately honest-scope wording).
  4. **Support process**: new `support_requests.priority` column
     (`supabase_schema_delta_support_priority.sql`), classified client-side
     in `ContactSupportModal.jsx` via a keyword list (same
     "template-classification, no AI needed" pattern as `ai-intake-chat`'s
     `EMERGENCY_KEYWORDS`) — urgent keywords: down/broken/can't log in/
     charged twice/refund/cancel/emergency/etc. `AdminConsole.jsx` now
     sorts urgent-open requests first, badges them, shows an urgent count
     in the tab label, and adds a "Reply by email" mailto link when
     `from_contact` looks like an email. New `SUPPORT_PLAYBOOK.md` documents
     SLA targets (2hr urgent / 1 business day routine, self-imposed not
     published externally) and canned responses for the actual sole-
     operator support process.
  5. **Non-code strategy docs** (no deploy needed, informational):
     `CUSTOMER_ACQUISITION_PLAN.md` (confirms the in-app Growth pillar —
     `generate-growth-drafts`/`launch-ad-campaign`/`send-growth-message` —
     is code-complete and safe, then lays out a concrete zero-ad-budget
     direct-outreach plan for Minerva's own first customers, explicit about
     what crosses into real-world account-creation/spend that only the user
     can execute) and `TAX_GST_NOTES.md` (general, non-personalised AU
     GST/income-tax education — $75k GST registration threshold, record-
     keeping, PAYG — plus the exact remaining Xero connection steps; flagged
     throughout as not a substitute for a registered tax agent).
  New SQL delta to run: `supabase_schema_delta_support_priority.sql`.
  New edge function to deploy: `create-billing-portal-session`.
  `npm run lint`/`npm test`/`npm run build` all verified clean.

## Confirmed live (2026-09-06, continued)

- **Missing UPDATE RLS policy on `checklist_photos`**: after finding
  `businesses` was missing its UPDATE policy, ran a systematic check of
  every table's RLS policy set (via `pg_policies`) against every
  INSERT/UPDATE/DELETE call actually made against it across the frontend
  and edge functions. Found the exact same bug on `checklist_photos` —
  RLS enabled with only INSERT and SELECT policies, no UPDATE, ever since
  the table was created. Empirically confirmed live (before and after the
  fix): inserted a disposable test row via the anon key, a PATCH to it
  returned HTTP 200 with an empty array (0 rows updated) pre-fix and the
  actual updated row post-fix, then deleted the test row directly via the
  Management API. Impact: this is the table `verify-checklist-photos`
  writes to (using the anon key, not service role) to record each photo's
  AI verification result — meaning the entire Watchtower AI photo-
  verification feature has never actually worked. Every checklist photo
  stays `'pending'` forever, `jobs.ai_verified_at` can never be set (the
  rollup requires zero `'pending'` photos on the job), and the "AI
  Verified" badge in DispatcherView/InvoiceView/DisputeView can never
  appear. This also means the false-`'pass'`-on-API-failure fix made
  earlier today never actually took effect in production either way,
  since no update to this table had ever persisted — it was still correct
  to have fixed the *logic*, but this RLS fix is what actually makes any
  of it take effect for the first time. Checked every other UPDATE/DELETE
  call site against the full table-policy map; no further gaps found
  (`integration_credentials`'s writes correctly use the service-role key,
  bypassing RLS; every other table already has the needed policy). Policy
  run live and confirmed via `pg_policies` plus a full round-trip test.

## Confirmed live (2026-09-06, continued)

- **Missing UPDATE RLS policy on `businesses`**: found while tracing
  exactly how `max_addons`/`subscription_tier` transition from unpaid to
  paid, to rule out a client-side billing bypass. No bypass exists — but
  the opposite bug does: `businesses` had RLS enabled with only an INSERT
  and SELECT policy, no UPDATE (or DELETE) policy was ever added.
  Empirically confirmed live via a direct anon-key PATCH request (HTTP
  200, empty array — 0 rows matched, value unchanged on read-back) that
  every anon-key UPDATE to `businesses` silently affected 0 rows. This
  broke three real, already-shipped features: (1)
  `RequireBusinessAuth.jsx`'s owner_user_id auto-claim never actually
  persisted (session-only "authorized" state, re-derived by email match
  every login instead of a real persisted claim); (2)
  `DispatcherView.jsx`'s Minerva Max add-on Enable/Start Trial/Disable
  buttons were entirely non-functional (silently swallowed Postgrest error
  from `.select().single()` on 0 matched rows — no error shown to the
  user); (3) `AdminConsole.jsx`'s `overrideTier()` manual tier override
  also silently no-op'd. This was an accidental oversight, not a
  deliberate protection — `src/maxAddons.js`'s own comment documents
  Minerva Max add-ons as intentionally self-serve/no-billing-check-needed
  at this build stage, and every other table in the schema already uses
  the same permissive `using (true)` pattern. Fixed by adding the same
  standard policy (`create policy "anon update business" on businesses for
  update using (true);`). Does not reopen a subscription_tier bypass: tier
  is already client-settable at signup via `Onboarding.jsx`'s INSERT
  (pre-existing, unrelated, out of scope here), and `stripe-webhook`'s own
  updates already use the service_role key, which bypasses RLS regardless.
  Policy run live and confirmed via `pg_policies`; also re-verified with a
  direct anon-key PATCH round-trip (probe value set then reverted) that
  updates to `businesses` now actually persist.

## Confirmed live (2026-09-06, continued)

- **Pro-tier gating, part 2**: the first Pro-tier gating pass covered
  `invoices`/`assets`/`inventory_items`; a follow-up pass on the same class
  of gap found two more tables with the identical issue —
  `technician_credentials` (DispatcherView's "Licence/Ticket Expiry
  Guardian") and `checklist_templates` (compliance checklist setup, used
  for both completion and onboarding checklists). Both are listed in
  `Onboarding.jsx`'s own TIERS copy as Pro-tier features, both have
  anon-writable INSERT RLS, and neither had a server-side check —
  `checklist_templates` in particular is a fully usable bypass (not just a
  dead row) since TechnicianView reads and acts on any checklist template
  that exists for the business regardless of tier. Fixed with the same
  `BEFORE INSERT` trigger pattern, reusing the `enforce_pro_tier_feature()`
  helper already created by the first delta. No frontend changes needed —
  both call sites already surface `err.message`/`insertErr.message`
  directly to the UI. Triggers run live and confirmed active via
  `pg_trigger` on both tables.

## Confirmed live (2026-09-06, continued)

- **Pro-tier feature server-side enforcement**: `Onboarding.jsx`'s own
  pricing copy defines "Pro" ($119/tech/mo) as "Everything in Standard +
  on-site invoicing, asset tracking, compliance checklists" — a real paid
  subscription-tier differentiator, not a cosmetic label. But all three
  features were gated frontend-only: `TechnicianView.jsx`'s invoice
  builder/materials/checklist flow and `DispatcherView.jsx`'s Assets/
  Inventory tabs only render when `business.subscription_tier === 'pro'`,
  while the underlying `supabase.from('invoices'/'assets'/'inventory_items')
  .insert(...)` calls had no tier check at all — and all three tables have
  anon-writable RLS (`with check (true)`). Any Starter ($49) or Standard
  ($79) business could call supabase-js directly (browser console, curl)
  and get Pro features for free, bypassing the UI entirely — a direct
  subscription-revenue bypass. Fixed with the same `BEFORE INSERT` trigger
  pattern as `crew_splitting`/`subcontractor_pool`
  (`supabase_schema_delta_pro_tier_gating.sql`, one trigger per table,
  checking `businesses.subscription_tier = 'pro'`). No frontend changes
  needed — all three call sites already surface `insertErr.message`/
  `err.message` directly to the UI. Pre-check confirmed the only live
  business is already on `pro`, so nothing was retroactively broken.
  Triggers run live and confirmed active via `pg_trigger` on all three
  tables (`assets`, `invoices`, `inventory_items`).

## Confirmed live (2026-09-06, continued)

- **`verify-checklist-photos` false-'pass' bug**: a further audit of Track
  A's Watchtower AI photo verification found `reviewPhoto()` returned
  `status: 'pass'` when the Anthropic API call itself failed (non-2xx
  response, or a thrown network exception) — inconsistent with the
  already-correct `'unavailable'` handling used when `ANTHROPIC_API_KEY` is
  simply unset. A genuine API failure (rate limit, outage, transient network
  error) was therefore recorded and shown as a "✓ AI verified" badge in
  `DispatcherView.jsx`/`InvoiceView.jsx`, and could count toward a job's
  `ai_verified_at` rollup and dispute evidence in `DisputeView.jsx`, even
  though the photo was never actually reviewed. Fixed by changing both
  failure paths (`!res.ok` and the catch block) to return `'unavailable'`
  instead of `'pass'`, matching the missing-key convention exactly — an
  unavailable photo is also correctly excluded from re-querying (filter is
  `.eq('verification_status', 'pending')`) so this doesn't cause endless
  retries, same permanent-non-retry behavior as the missing-key case.
  Redeployed live and pushed (`d484da4`).
- **`review_requests.invoice_id` unique index**
  (`supabase_schema_delta_review_requests_unique.sql`, closes the
  `send-review-request-sms` double-send gap fixed 2026-09-05): pre-check for
  existing duplicate `invoice_id` rows returned none, index created and
  confirmed live via `pg_indexes`.

## Confirmed live (2026-09-06)

**subcontractor_pool addon-gating gap**: an audit of the auth/RLS layer led
to checking every Minerva Max add-on for the same class of gap
`crew_splitting` had before its 2026-09-04 fix (frontend-only gating, no
server enforcement). Found `subcontractor_pool` had the identical gap —
`DispatcherView.jsx` only shows the "+ Add" button/Subcontractors tab when
the add-on is active, but nothing stopped a direct insert into the
anon-writable `subcontractors` table regardless of add-on status, and
`auto-assign-technician`'s subcontractor-fallback branch never checked the
add-on at all before auto-dispatching to one. Fixed with the same pattern
as `crew_splitting`: a `BEFORE INSERT` trigger on `subcontractors`
(`supabase_schema_delta_subcontractor_pool_addon.sql`,
`enforce_subcontractor_pool_addon()`) plus a check in
`auto-assign-technician` itself (since old subcontractor rows could
outlive a lapsed trial/subscription — the insert trigger alone wouldn't
catch that). `addSubcontractor()`'s error handling updated to surface the
trigger's message, matching `addCrewMember()`'s existing pattern.
Trigger run live and confirmed active via `pg_trigger`; `auto-assign-
technician` redeployed and confirmed.

## Confirmed live (2026-09-05, this session)

**2026-09-05 — client-facing link data-exposure fix** (built, tested,
committed locally — no new SQL, just a code fix, so nothing to run live,
only a redeploy of the frontend needed): a fresh audit of the no-login,
link-based client-facing pages (`TrackingView.jsx`, `InvoiceView.jsx`,
`DisputeView.jsx`, `QuoteView.jsx`, `ClientHistoryView.jsx`,
`calendar-feed`, `track-review-click`) found that four of them
(`TrackingView`, `InvoiceView`, `DisputeView`, `QuoteView`) fetched the
full `businesses(*)` row — including `slack_webhook_url` and
`meta_access_token`, both explicitly documented in `SECURITY_NOTES.md` as
secrets scoped to "anyone with the *dispatch* link" — while only ever
displaying `.name`. That meant any external client holding a job-tracking,
invoice, quote, or dispute-pack link (not staff, an actual customer) could
read those secrets straight out of the network response. Fixed by trimming
all four queries to `businesses(name)`. `ClientHistoryView`, `calendar-feed`,
and `track-review-click` were audited too and found already correctly
scoped (no fix needed). See `SECURITY_NOTES.md` for the updated note.

**2026-09-05 — double-send race-condition audit pass** (built, tested,
committed locally — not yet deployed live, needs a fresh Supabase PAT):
a fresh Explore-subagent audit of AI/agent-facing edge functions (the area
not covered by the perf/Stripe/billing pass earlier the same day) found two
genuine double-send gaps, same TOCTOU pattern already fixed in
`send-growth-message`/`launch-ad-campaign` but missed on two other
SMS-sending functions:
- `send-quote-sms` — added an atomic conditional-update claim
  (`UPDATE quotes SET status='sending' WHERE status='draft'`) before
  sending, reverting to `'draft'` on send failure so a legitimate retry
  still works.
- `send-review-request-sms` — no per-invoice status field to key an atomic
  update off, so instead added a unique index on
  `review_requests.invoice_id` (`supabase_schema_delta_review_requests_
  unique.sql`) — the insert itself is now the atomic claim; a second
  concurrent request gets a 23505 unique-violation instead of sending a
  second SMS. The claim row is deleted on send failure so the unique index
  doesn't block a legitimate retry.
- Audited but found no gap: all other SMS-sending functions
  (`send-eta-sms`, `send-setup-sms`, `send-completion-sms`,
  `send-invoice-sms`, `send-job-assignment-sms`,
  `send-weather-reschedule-sms`, `retention-checkin`,
  `nurture-stale-leads`, `chase-unpaid-invoices`, `send-referral-code-sms`)
  already have an idempotency guard or are single-shot with no retry path.
  `ai-intake-chat`'s no-fallback-on-Anthropic-error behaviour was flagged
  as a possible gray area but left alone — it's documented existing
  behaviour, not a newly-introduced bug, and changing lead-capture behaviour
  on AI failure is a product decision, not something to change unilaterally
  in an audit pass.
Needs: run `supabase_schema_delta_review_requests_unique.sql`, redeploy
`send-quote-sms` and `send-review-request-sms`.

(Local commit `09aa680`, the geofencing/self-healing/offline batch below,
is built and confirmed live in the DB/functions but the commit itself is
not yet pushed to `origin/main` — needs a fresh GitHub PAT + explicit push
permission, per standing rule.)

## Confirmed live (2026-09-05, this session)

**Geofencing/self-healing/offline batch** (local commit `09aa680`):
`businesses.auto_dispatch_max_km` column added and verified;
`reconcile-technician-state` deployed and confirmed; `auto-assign-technician`
redeployed with the radius-cap logic; `reconcile-technician-state-daily`
cron scheduled (`30 5 * * *`, jobid 50) and confirmed active.

**RLS read-scoping pass 1** (`supabase_schema_delta_rls_scoping_v1.sql`):
new `admin_users` table + tightened SELECT on `assets`, `subcontractors`,
`technician_incidents`, `upsell_nudge_dismissals` (owner-only now) and
`support_requests` (admin-only now). Run live and verified via query.
Still needed: add yourself to `admin_users` (one-line SQL in the file's
header comment) after you've logged in once via `/login`, or the Support
tab in `/admin` will look empty even though it's working correctly.

## Audit findings deliberately NOT built this session (2026-09-04)

Found by the same audit pass, judged lower-priority or higher-scope than
what fit in the session, and intentionally left for a future pass rather
than rushed. (The other 5 originally listed here — crew-member
enforcement, checklist-photo retry, no-show SMS, invoice void, and
PWA/offline mode — were all built in later rounds; see the 2026-09-04
"do both" entry and the 2026-09-05 PWA entry above.)

- Hard-blocking a job/invoice when a technician's credential is already
  expired — this was a deliberate prior design decision
  (`check-credential-expiry`'s header comment: "never a client SMS... purely
  an internal compliance nudge") and was correctly left alone rather than
  unilaterally reversed.

## Architecture roadmap items NOT built (2026-09-05)

User pasted a generic 4-component roadmap table (Employee Phones / Agent
Networks / Core Systems / Data Pipelines, each with "immediate refinement"
and "future expansion" columns) and asked for everything on it. Audited
each row against the real codebase before building anything blind:

- **Built** (genuine matches): geofenced auto-dispatch radius
  (`auto_dispatch_max_km`, "Employee Phones"/"Agent Networks" —
  proximity-based assignment already existed via `auto-assign-technician`,
  this adds the missing distance cap); offline job-detail caching in
  `TechnicianView.jsx` (real gap — only GPS writes were offline-protected
  before, not job reads); `reconcile-technician-state` cron ("Core
  Systems" self-healing — fixes a real, verified drift bug where a
  technician's `current_job_id` can get stuck pointing at an already-
  finished job if their two completion writes don't both land).
- **Not built, no real analog in this codebase**: "autonomous cross-agent
  negotiation" (there's no message bus or agent-to-agent protocol for
  ~50 independent edge functions to negotiate over — inventing one with
  no concrete use case would be complexity for its own sake) and
  "predictive load balancing" / "dynamic payload optimization" (no
  request-routing layer exists to optimize; the closest real lever,
  trimming ~24 `select('*')` calls in `DispatcherView.jsx`'s initial load,
  was deliberately skipped too — see below).
- **Not built, deliberately, as a scale/risk call**: trimming
  `DispatcherView.jsx`'s `select('*')` queries to named columns. No
  evidence of an actual latency problem at this business's current scale
  (sole trader, pre-revenue), and 24 call sites is a lot of surface area
  to introduce a subtle "forgot to select a field some render path needs"
  bug into a live app for a speculative gain. Worth doing once there's a
  real user/data-volume reason to.
- **Explicitly declined**: "event-driven micro-webhooks to replace
  scheduled polling entirely" (Core Systems). This is a full backend
  rearchitecture — ~15 independent `pg_cron` schedules would all need to
  be replaced with DB triggers or push-based integrations from external
  services, on a system with real customer data and no comprehensive test
  suite yet. Consistent with the standing boundary against large blind
  rearchitectures — this needs to be its own scoped, reviewed project if
  wanted, not something to "just do" alongside smaller fixes.

## Still outstanding (non-code, needs the user or a bank account)

- Twilio Voice webhook for `missed-call-webhook` — blocked, trial accounts
  require personal phone verification before purchasing any number, user
  can't complete that step.
- `TWILIO_PHONE_NUMBER` and `ANTHROPIC_API_KEY` secrets — blocked on
  connecting a bank account (Twilio SMS-capable upgrade, Anthropic Console
  payment-method gate).
- Mapbox token — not yet confirmed copied into `.env.local` (same
  payment-method gate hit 2026-08-29).
- Day 7 end-to-end testing checklist (`README.md`) — needs a real phone,
  real Stripe test-mode checkout, and real SMS receipt, so this has to be
  run by the user directly rather than by an agent (falls outside the
  standing "no real customer messages / no real paid signups" boundary).
- Xero developer app registration (`developer.xero.com`) — the account
  holder has to create their own free app and hand over the resulting
  `XERO_CLIENT_ID`/`XERO_CLIENT_SECRET`; not something that can be done on
  the user's behalf. Until then "Connect Xero" in Settings just shows a
  setup message — the OAuth code (`xero-oauth-connect`,
  `xero-oauth-callback`, `xero-sync-invoice`) is built and deployed, only
  the credentials are missing.
- Real Stripe per-add-on billing wiring for the Minerva Max tier — the
  add-on enable/trial flags and gating are live, but actually charging for
  each add-on through Stripe still needs to be wired up and walked through
  with the user (per the standing boundary on Stripe account changes).
