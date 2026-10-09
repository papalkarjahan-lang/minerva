-- ============================================================
-- MINERVA — Delta: cron schedule for notify-trial-ending, 2026-10-09.
-- Pre-filled with the project's real project ref/anon key, same pattern as
-- every other cron delta file. Run this once, AFTER notify-trial-ending
-- has been deployed.
-- Kept separate from the matching registration delta per this project's
-- established convention of never mixing DDL/DML and live cron.schedule()
-- calls.
-- ============================================================

-- Daily at 6:45am UTC (early-morning batch, same family as the 6:00/6:15
-- slots already in use, offset to avoid stacking): remind a business
-- when its main 7-day account trial is about to end and convert to a
-- real charge.
select cron.schedule(
  'notify-trial-ending-daily',
  '45 6 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/notify-trial-ending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
