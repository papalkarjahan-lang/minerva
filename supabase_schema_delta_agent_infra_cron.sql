-- ============================================================
-- MINERVA — Delta: cron schedule for test-agent-health (Agent Operating
-- System, Phase 1 infrastructure), 2026-09-01.
-- Pre-filled with your real project ref/anon key (same values already used
-- in supabase_schema.sql's AUTONOMOUS AGENTS section and every other cron
-- delta file). Run this once, AFTER BOTH:
--   1. supabase_schema_delta_agent_infra.sql has been run (creates
--      agent_functions, which this function reads).
--   2. test-agent-health has been deployed
--      (supabase functions deploy test-agent-health).
-- Kept separate from supabase_schema_delta_agent_infra.sql per this
-- project's established convention of never mixing DDL and live
-- cron.schedule() calls in the same delta file.
-- ============================================================

-- Every 15 min: passive staleness/error-rate sweep of every enabled row in
-- agent_functions. Does not invoke any other function directly — see
-- test-agent-health/index.ts header comment for why.
select cron.schedule(
  'test-agent-health-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/test-agent-health',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
