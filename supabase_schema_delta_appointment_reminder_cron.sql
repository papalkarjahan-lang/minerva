-- ============================================================
-- MINERVA — Delta: cron schedule for send-appointment-reminder-sms,
-- 2026-10-23. Kept separate from the matching registration/column delta
-- per this project's established convention of never mixing DDL/DML and
-- live cron.schedule() calls.
-- Run this once, AFTER send-appointment-reminder-sms has been deployed
-- and supabase_schema_delta_appointment_reminder.sql has been run.
-- ============================================================

-- Daily at 7:30am UTC (~5:30-6:30pm AEST/AEDT, a courteous evening-before
-- hour) — offset from chase-unpaid-invoices (9am UTC) and check-weather-
-- risk (20:00 UTC) to avoid stacking, same convention as every other cron
-- delta in this project.
select cron.schedule(
  'send-appointment-reminder-sms-daily',
  '30 7 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/send-appointment-reminder-sms',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
