-- ============================================================
-- MINERVA — Delta: register followup-outreach with the Agent OS
-- (2026-09-22). Same bug class as supabase_schema_delta_operational_fixes.sql
-- ("5 cron functions deployed+scheduled but never registered in
-- agent_functions, so they were invisible to test-agent-health and the
-- kill-switch") — found again on a fresh audit: followup-outreach runs
-- daily via cron.schedule (supabase_schema_delta_outreach_engine_cron.sql)
-- and even has a hand-maintained cadence entry in test-agent-health's
-- CADENCE_MINUTES map, but was never actually seeded into agent_functions,
-- so that cadence entry was dead code — test-agent-health only iterates
-- rows that exist in the table, and error_count could never accumulate
-- since nothing ever called record_agent_run for this function name.
--
-- followup-outreach/index.ts now checks agent_functions.enabled and calls
-- record_agent_run(fn_name, status) on both success and failure, matching
-- every other cron agent function's pattern. This delta just backfills the
-- row those calls depend on (record_agent_run's own ON CONFLICT would
-- create it lazily on first run anyway, but seeding it now with the
-- correct 'outreach' agent tag — matching its siblings nurture-stale-leads/
-- chase-unpaid-invoices/retention-checkin/winback-lost-leads — avoids it
-- briefly showing up mis-tagged as 'core' in the Agent Ops dashboard).
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

insert into agent_functions (name, agent) values
  ('followup-outreach', 'outreach')
on conflict (name) do nothing;
