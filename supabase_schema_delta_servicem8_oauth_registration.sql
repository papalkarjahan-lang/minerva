-- ============================================================
-- MINERVA — register the new ServiceM8 OAuth functions in agent_functions
-- (2026-10-30). Same risk-based kill-switch scoping already established
-- for the Xero pair (supabase_schema_delta_agent_registration_round3.sql):
--   - servicem8-oauth-connect: real enabled-check wired in. Entry point
--     of the flow, before the business owner has approved anything on
--     ServiceM8's own screen — disabling just stops new connections
--     from starting.
--   - servicem8-oauth-callback: registered for visibility/health
--     tracking only, deliberately NO enabled-check. By the time
--     ServiceM8 redirects here, the business owner has already approved
--     the connection on ServiceM8's own screen — disabling here would
--     strand an already-granted authorization half-completed.
-- Run alongside supabase_schema_delta_servicem8_oauth.sql, either order.
-- ============================================================

insert into agent_functions (name, agent) values
  ('servicem8-oauth-connect', 'finance'),
  ('servicem8-oauth-callback', 'finance')
on conflict (name) do nothing;
