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
