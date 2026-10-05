-- ============================================================
-- MINERVA — Delta: register notify-new-support-request with the Agent OS
-- (2026-10-05). Same registration pattern as every other agent — see
-- supabase_schema_delta_followup_outreach_agent_registration.sql. No
-- matching cron delta needed — unlike most registered functions, this one
-- is triggered directly by ContactSupportModal.jsx right after a real
-- support request is submitted, not on a schedule.
-- Run once, alongside supabase_schema_delta_support_request_notify.sql.
-- ============================================================

insert into agent_functions (name, agent) values
  ('notify-new-support-request', 'core')
on conflict (name) do nothing;
