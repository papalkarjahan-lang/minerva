-- ============================================================
-- MINERVA — Delta: register new-subscriber-checkin with the Agent OS
-- (2026-10-05). Same registration pattern as every other cron agent — see
-- supabase_schema_delta_followup_outreach_agent_registration.sql. Tagged
-- 'outreach', same group as retention-checkin (the closest sibling in
-- shape, just for a different relationship — Minerva to its own business
-- customers, not a trade business to its clients).
-- Run once, alongside supabase_schema_delta_new_subscriber_checkin.sql and
-- supabase_schema_delta_new_subscriber_checkin_cron.sql.
-- ============================================================

insert into agent_functions (name, agent) values
  ('new-subscriber-checkin', 'outreach')
on conflict (name) do nothing;
