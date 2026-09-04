-- ============================================================
-- MINERVA — Delta: cron schedule for the round-2 batch's one new cron
-- function (forecast-demand), 2026-09-04. Same project ref/anon key already
-- used in every other cron delta file. Run this once, AFTER:
--   1. supabase_schema_delta_minerva_round2.sql has been run
--   2. forecast-demand has been deployed
-- Kept separate from supabase_schema_delta_minerva_round2.sql per this
-- project's established convention of never mixing DDL and live
-- cron.schedule() calls in the same delta file.
-- ============================================================

-- Weekly, Sundays 20:00 UTC (~06:00 AEST Monday) — so Monday morning's
-- dispatcher session opens with the freshest possible trend read on the
-- week that just ended.
select cron.schedule(
  'forecast-demand-weekly',
  '0 20 * * 0',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/forecast-demand',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
