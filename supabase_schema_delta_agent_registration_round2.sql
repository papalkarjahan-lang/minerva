-- ============================================================
-- MINERVA — Delta: register round 2 of previously-unregistered edge
-- functions with the Agent OS (2026-09-23).
--
-- Found via a fresh bidirectional diff of supabase/functions/*/ directory
-- names against the live agent_functions table: 16 functions exist in
-- code, are functionally identical to an already-registered/gated sibling
-- (same real-world-action category — SMS send, AI chat widget, financial
-- write, shared email utility, technician auth), yet had no row in
-- agent_functions at all. This is a distinct bug class from the "registered
-- but wiring never connected" issue fixed in earlier rounds (e.g.
-- supabase_schema_delta_followup_outreach_agent_registration.sql) — here
-- the DB row itself never existed, so record_agent_run would have lazily
-- created a mis-tagged 'core' row on first call rather than the correct
-- category below.
--
-- Each of the 13 functions tagged below now also has a real
-- agent_functions.enabled check wired into its code (kill-switch capable).
-- The last 3 (create-invoice-payment-intent, create-billing-portal-session,
-- technician-login) are registered for dashboard visibility/health
-- tracking only — deliberately NO enabled-check wired into their code,
-- same risk-based scoping as create-checkout-session/stripe-webhook: the
-- blast radius of disabling a live payment or auth flow outweighs the
-- benefit of a kill switch. See each function's own header comment for
-- the specific reasoning.
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

insert into agent_functions (name, agent) values
  ('generate-compliance-package', 'core'),
  ('optimize-daily-route', 'scheduling'),
  ('send-job-assignment-sms', 'core'),
  ('send-quote-sms', 'marketing'),
  ('send-review-request-sms', 'marketing'),
  ('send-outreach-batch', 'outreach'),
  ('client-support-chat', 'core'),
  ('voice-intake-agent', 'outreach'),
  ('send-email', 'core'),
  ('draft-quote', 'core'),
  ('draft-outreach-batch', 'outreach'),
  ('parse-prospect-text', 'outreach'),
  ('xero-sync-invoice', 'finance'),
  ('create-invoice-payment-intent', 'core'),
  ('create-billing-portal-session', 'core'),
  ('technician-login', 'core')
on conflict (name) do nothing;
