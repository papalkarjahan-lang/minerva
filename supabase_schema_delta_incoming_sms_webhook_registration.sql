-- ============================================================
-- MINERVA — Delta: register incoming-sms-webhook with the Agent OS,
-- 2026-10-11. Run once in the Supabase SQL Editor, after
-- supabase_schema_delta_incoming_sms_webhook.sql.
--
-- Same 'core' category as its sibling missed-call-webhook (both are
-- Twilio-triggered webhooks reacting to a real person's action, not a
-- scheduled sweep). Registered for dashboard visibility/health tracking;
-- deliberately no agent_functions.enabled kill-switch check wired into
-- the function's own code, same risk-based scoping missed-call-webhook
-- itself uses and explains in its own header — the function's only
-- side effects (a job-notes append, a Slack post) are low-blast-radius
-- enough that a kill switch isn't worth the extra code path, and the
-- function must always return valid TwiML to Twilio regardless.
-- ============================================================

insert into agent_functions (name, agent) values
  ('incoming-sms-webhook', 'core')
on conflict (name) do nothing;
