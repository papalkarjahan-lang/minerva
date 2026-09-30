-- ============================================================
-- MINERVA — Delta: cron schedule for notify-addon-trial-ending, 2026-09-30.
-- Pre-filled with the project's real project ref/anon key, same pattern as
-- every other cron delta file. Run this once, AFTER
-- notify-addon-trial-ending has been deployed.
-- Kept separate from the matching registration delta per this project's
-- established convention of never mixing DDL/DML and live cron.schedule()
-- calls.
-- ============================================================

-- Daily at 9:30am UTC (offset 30min from chase-unpaid-invoices to avoid
-- stacking): alert a business when one of its Minerva Max add-on trials
-- is about to lapse.
select cron.schedule(
  'notify-addon-trial-ending-daily',
  '30 9 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/notify-addon-trial-ending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
