-- ============================================================
-- MINERVA — Delta: register notify-new-enterprise-lead with the Agent OS
-- (2026-10-05). Same registration pattern as every other agent — see
-- supabase_schema_delta_followup_outreach_agent_registration.sql. No
-- matching cron delta needed — this fires directly from Enterprise.jsx
-- right after a real lead is submitted, not on a schedule, same shape as
-- notify-new-support-request.
-- Run once, alongside supabase_schema_delta_enterprise_lead_notify.sql.
-- ============================================================

insert into agent_functions (name, agent) values
  ('notify-new-enterprise-lead', 'core')
on conflict (name) do nothing;
