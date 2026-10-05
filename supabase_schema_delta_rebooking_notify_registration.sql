-- ============================================================
-- MINERVA — Delta: register notify-rebooking-request with the Agent OS
-- (2026-10-05). Same registration pattern as every other agent — see
-- supabase_schema_delta_followup_outreach_agent_registration.sql. No
-- matching cron delta needed — this fires directly from TrackingView.jsx
-- right after a real rebooking request is submitted, not on a schedule,
-- same shape as notify-new-support-request/notify-new-enterprise-lead.
-- Run once, alongside supabase_schema_delta_rebooking_notify.sql.
-- ============================================================

insert into agent_functions (name, agent) values
  ('notify-rebooking-request', 'outreach')
on conflict (name) do nothing;
