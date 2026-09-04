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

## Not yet deployed live

The 2026-09-05 industrial/B2B audit-pass batch and the PWA/offline-mode
batch above are committed locally only — the 10 industrial edge functions
need redeploying and the commits need pushing to `origin/main`, both
blocked on fresh one-time PATs per the standing convention. Nothing else
outstanding from earlier batches.

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
