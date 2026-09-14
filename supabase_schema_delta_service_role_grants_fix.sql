-- ============================================================
-- MINERVA - Fix: missing base GRANTs on 3 tables (2026-09-14)
--
-- CONTEXT: RLS pass 5 (rls_scoping_v4.sql) found `corrective_actions` had
-- never had a base GRANT to anon/authenticated since creation. That
-- discovery raised the obvious next question: is this a one-off, or a
-- class of bug? Ran a systematic query cross-referencing every RLS
-- policy's (role, command) pair on every RLS-enabled table against
-- information_schema.role_table_grants, independent of any assumption
-- about which tables might be affected.
--
-- Found 3 more tables with the SAME class of bug, but worse this time:
-- the missing grant isn't just on `anon` (which only affects error-vs-
-- clean-deny UX), it's on `service_role` itself — the key every backend
-- edge function trusts completely. Confirmed live: a direct service_role
-- REST call to SELECT `outreach_prospects` or `big_account_targets`
-- returns 403 "permission denied", not data.
--
-- Confirmed via grep of every real caller before writing this:
--
-- 1. `roi_proposals` — `generate-roi-proposal` (service_role) does
--    `.insert({...}).select().single()` — needs INSERT *and* SELECT
--    (the chained `.select()` does an implicit RETURNING under the
--    caller's own role). Neither was ever granted to service_role.
--    Separately, `AdminConsole.jsx`'s pipeline view reads this table
--    while logged in (a real Supabase Auth session, i.e. Postgres role
--    `authenticated`, not `anon`) — `authenticated` had zero grant on
--    this table at all (only `anon`, for the public ProposalView.jsx
--    link, was ever granted). Both gaps mean: proposal generation has
--    been silently no-op-failing since this table was created, and the
--    admin console's proposal-status column has been erroring for any
--    logged-in admin the whole time.
--
-- 2. `big_account_targets` — `generate-roi-proposal` also reads
--    (`.select('stage')`) and updates (`stage: 'proposal_sent'`) this
--    table via service_role, to auto-advance the pipeline stage when a
--    proposal is generated. Neither was ever granted to service_role —
--    this auto-advance has silently never worked.
--
-- 3. `outreach_prospects` — `parse-prospect-text` (`.insert(...).select
--    ('id')`), `draft-outreach-batch` (`.select('*')` +
--    `.update({draft_subject, draft_body,...})`), `followup-outreach`
--    (`.select('*')` + `.update({status/draft_subject/...})`), and
--    `send-outreach-batch` (`.select('*')` + `.update({sent_at,...})`)
--    all run as service_role and all need SELECT/INSERT/UPDATE. None
--    were ever granted — the entire outreach engine (Minerva's own
--    sales pipeline, see SECURITY_NOTES.md "Added 2026-09-10") has been
--    completely non-functional at the database layer since creation,
--    independent of any RLS policy correctness, with no error visible
--    anywhere except inside each cron function's own logs.
--
-- None of these are security regressions — `anon` access is unaffected
-- either way (roi_proposals' anon SELECT was already correctly scoped;
-- big_account_targets/outreach_prospects were never anon-reachable at
-- all, confirmed by grep, so no anon grant is added here either). This
-- is purely restoring the backend's own trusted access to its own
-- tables, so features that have been silently doing nothing start
-- actually running.
-- ============================================================

grant select, insert on roi_proposals to service_role;
grant select on roi_proposals to authenticated;

grant select, update on big_account_targets to service_role;

grant select, insert, update on outreach_prospects to service_role;
