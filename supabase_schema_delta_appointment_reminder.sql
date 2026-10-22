-- ============================================================
-- MINERVA — Delta: jobs.appointment_reminder_sent + agent registration
-- for send-appointment-reminder-sms (2026-10-23).
--
-- What this fixes: "automated invoice payment reminders" was marketed as
-- one of Standard's 6 real automations (Onboarding.jsx, Pricing.jsx,
-- LandingPage.jsx, Features.jsx), gated server-side via
-- hasStandardAutomation and reused via chase-unpaid-invoices. But on-site
-- invoicing is Pro-exclusive (TechnicianView.jsx only shows the invoice
-- builder for subscription_tier === 'pro'), so a Standard-tier trade
-- business never has an invoices row — chase-unpaid-invoices could never
-- fire for the tier it was sold to. Same root bug as the referral-code gap
-- fixed earlier this session (an invoice-paid-only trigger, Pro-exclusive
-- invoicing), just caught on the tier axis instead of the sector axis. See
-- BILLING_INTEGRITY_NOTES.md's follow-up entry for the full trace.
--
-- Fix: a new feature actually reachable from the `jobs` table every tier
-- has — send-appointment-reminder-sms texts the client a reminder the day
-- before their scheduled job, same "falls through the cracks" proactive-
-- automation shape as the other 5 Standard features, gated the same way
-- (hasStandardAutomation).
--
-- Run this once, alongside the matching cron delta
-- (supabase_schema_delta_appointment_reminder_cron.sql), AFTER
-- send-appointment-reminder-sms has been deployed.
-- ============================================================

alter table jobs add column if not exists appointment_reminder_sent bool default false;

insert into agent_functions (name, agent) values
  ('send-appointment-reminder-sms', 'scheduling')
on conflict (name) do nothing;
