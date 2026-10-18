-- ============================================================
-- MINERVA — Combined Phase 2 SQL deltas (2026-10-18)
-- Agent OS registration for 8 functions. Run AFTER Phase 1 (PHASE1_
-- COMBINED.sql) and BEFORE Phase 3 (redeploying the functions
-- themselves). All 8 use 'on conflict (name) do nothing' (fixed one
-- that was missing it — incoming-sms-webhook — for consistency), so
-- this whole block is safe to re-run if needed.
-- ============================================================

-- ============================================================
-- FROM: supabase_schema_delta_signup_recovery_registration.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase_schema_delta_new_subscriber_checkin_registration.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase_schema_delta_support_request_notify_registration.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase_schema_delta_enterprise_lead_notify_registration.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase_schema_delta_rebooking_notify_registration.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase_schema_delta_trial_ending_reminder_registration.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: register notify-trial-ending with the Agent OS
-- (2026-10-09). Run once, alongside
-- supabase_schema_delta_trial_ending_reminder_cron.sql, after
-- supabase_schema_delta_trial_ending_reminder.sql (needs that column to
-- exist first). Same registration pattern as every other cron agent —
-- see supabase_schema_delta_addon_trial_reminder_registration.sql.
-- 'finance' category, same as reconcile-billing — this is about an
-- existing signed-up business's own billing/account state, not outreach
-- to a prospect.
-- ============================================================

insert into agent_functions (name, agent) values
  ('notify-trial-ending', 'finance')
on conflict (name) do nothing;


-- ============================================================
-- FROM: supabase_schema_delta_incoming_sms_webhook_registration.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase_schema_delta_fleet_optimization_registration.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: register optimize-fleet-day with the Agent OS
-- (2026-10-18). Run once, any time after supabase_schema_delta_
-- fleet_optimization.sql. Same registration pattern as every other
-- human-click scheduling agent — see supabase_schema_delta_
-- agent_registration_round2.sql's own optimize-daily-route row.
-- 'scheduling' category, same as optimize-daily-route — this is the
-- whole-fleet sibling of that exact function.
-- ============================================================

insert into agent_functions (name, agent) values
  ('optimize-fleet-day', 'scheduling')
on conflict (name) do nothing;


