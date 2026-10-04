-- ============================================================
-- MINERVA — Delta: register recover-abandoned-signup with the Agent OS
-- (2026-10-05). Same registration pattern as every other cron agent —
-- see supabase_schema_delta_followup_outreach_agent_registration.sql.
-- Tagged 'outreach', same group as its siblings nurture-stale-leads/
-- winback-lost-leads/notify-addon-trial-ending — this is the same
-- "someone didn't convert, try once to bring them back" shape, just for a
-- stalled signup instead of a stale lead or lapsing add-on.
-- Run once, alongside supabase_schema_delta_signup_recovery.sql and
-- supabase_schema_delta_signup_recovery_cron.sql.
-- ============================================================

insert into agent_functions (name, agent) values
  ('recover-abandoned-signup', 'outreach')
on conflict (name) do nothing;
