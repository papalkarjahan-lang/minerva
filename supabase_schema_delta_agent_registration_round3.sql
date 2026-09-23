-- ============================================================
-- MINERVA — Delta: register round 3 of previously-unregistered edge
-- functions with the Agent OS (2026-09-23, Round 40).
--
-- Found via a fresh bidirectional diff of supabase/functions/*/ directory
-- names against the live agent_functions table (re-running the same check
-- from supabase_schema_delta_agent_registration_round2.sql, which itself
-- warned this was "worth doing again periodically"): 4 more functions
-- existed in code with no row in agent_functions at all —
-- generate-roi-proposal, track-review-click, xero-oauth-callback,
-- xero-oauth-connect. The smoking-gun evidence this is a genuine gap and
-- not a deliberate exclusion: xero-sync-invoice (same Xero integration
-- family) WAS already registered in round 2, while its own
-- xero-oauth-connect/xero-oauth-callback siblings were not.
--
-- Risk-based kill-switch scoping (same precedent as round 2's
-- create-checkout-session/stripe-webhook reasoning):
--   - generate-roi-proposal: real enabled-check wired in. Pure
--     admin-triggered content generation, no in-flight third party to
--     strand — safe to gate.
--   - xero-oauth-connect: real enabled-check wired in. Entry point of the
--     OAuth flow, before the business owner has approved anything on
--     Xero's side — disabling just stops new connections from starting.
--   - track-review-click: registered for visibility/health tracking only,
--     deliberately NO enabled-check. The review link was already sent to
--     a real customer's phone before this ever runs; a kill switch could
--     only turn a working link into a dead one for someone who already
--     has it.
--   - xero-oauth-callback: registered for visibility/health tracking
--     only, deliberately NO enabled-check. By the time Xero redirects
--     here, the business owner has already approved the connection on
--     Xero's own screen — disabling here would strand an
--     already-granted authorization half-completed.
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

insert into agent_functions (name, agent) values
  ('generate-roi-proposal', 'outreach'),
  ('track-review-click', 'marketing'),
  ('xero-oauth-connect', 'finance'),
  ('xero-oauth-callback', 'finance')
on conflict (name) do nothing;
