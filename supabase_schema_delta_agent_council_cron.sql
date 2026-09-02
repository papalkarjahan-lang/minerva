-- ============================================================
-- MINERVA — Delta: cron schedule for agent-council-report (Agent Operating
-- System, Phase 4 — weekly Agent Council report), 2026-09-01.
-- Pre-filled with your real project ref/anon key (same values already used
-- in supabase_schema.sql's AUTONOMOUS AGENTS section and every other cron
-- delta file). Run this once, AFTER BOTH:
--   1. supabase_schema_delta_agent_council.sql has been run (creates
--      agent_council_reports, which this function writes to).
--   2. agent-council-report has been deployed
--      (supabase functions deploy agent-council-report).
-- Kept separate from supabase_schema_delta_agent_council.sql per this
-- project's established convention of never mixing DDL and live
-- cron.schedule() calls in the same delta file.
-- ============================================================

-- Weekly, Monday 21:00 UTC (~7-8am Tuesday AEST/AEDT): agent-council-report
-- reads the last 7 days of agent_insights + agent_functions across the
-- whole platform and writes one synthesis row to agent_council_reports.
-- Scheduled the day after the Sunday 21:00 UTC generate-growth-drafts run
-- (see supabase_schema.sql) so the week's marketing-draft insight, if any,
-- has already landed before this report runs.
select cron.schedule(
  'agent-council-report-weekly',
  '0 21 * * 1',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/agent-council-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
