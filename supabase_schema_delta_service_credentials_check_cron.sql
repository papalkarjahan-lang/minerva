-- ============================================================
-- MINERVA — Delta: cron schedule for check-service-credentials, 2026-10-24.
-- Kept separate from the registration delta per this project's established
-- convention of never mixing DDL/DML and live cron.schedule() calls.
-- Run once, AFTER check-service-credentials has been deployed and
-- supabase_schema_delta_service_credentials_check.sql has been run.
-- ============================================================

-- Daily at 20:30 UTC (offset from check-weather-risk's 20:00 UTC and
-- chase-unpaid-invoices' 9am UTC to avoid stacking): verify Twilio/
-- Anthropic/Resend are actually working, not just "configured."
select cron.schedule(
  'check-service-credentials-daily',
  '30 20 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/check-service-credentials',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
