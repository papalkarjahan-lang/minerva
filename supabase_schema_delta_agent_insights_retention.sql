-- ============================================================
-- MINERVA — retention cleanup for agent_insights (2026-10-25).
--
-- Same class of problem as supabase_schema_delta_retention_cleanup.sql
-- (2026-09-25) — "audited every table with an expiry/timestamp column
-- for a cleanup path" — but agent_insights wasn't in scope back then and
-- has grown unbounded ever since: every autonomous agent that writes an
-- informational/alert row (check-service-credentials, forecast-demand,
-- generate-growth-drafts, agent-council-report, and others) adds a
-- permanent row with no cleanup path at all, several of them on a
-- 15-minute or hourly cadence.
--
-- Checked every reader before picking a window (grepped every
-- `.from('agent_insights')` read across supabase/functions/) — the
-- longest actual lookback in this codebase is generate-growth-drafts'
-- own 90-day suburb-opportunity dedup; everything else (demand-forecast
-- dedup, agent-council-report's weekly digest) looks back 6-14 days.
-- 180 days is a generous 2x safety margin over the longest real
-- dependency, same "comfortable debugging buffer" philosophy as the
-- 2026-09-25 file's own 90-day idempotency-log windows (which guard a
-- provider retry window measured in hours/days, not months).
--
-- Direct SQL DELETE via pg_cron, NOT an edge function — same reasoning
-- as the 2026-09-25 file: pure internal janitorial work with zero
-- user-facing side effects and nothing to ever kill-switch, so routing
-- through agent_functions/record_agent_run would add ceremony with no
-- benefit.
-- ============================================================

select cron.schedule(
  'cleanup-agent-insights-daily',
  '50 3 * * *',
  $$delete from agent_insights where created_at < now() - interval '180 days';$$
);

-- Verify after running:
--   select * from cron.job where jobname = 'cleanup-agent-insights-daily'; -- expect: 1 row
