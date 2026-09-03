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
