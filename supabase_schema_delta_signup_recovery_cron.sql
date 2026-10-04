-- ============================================================
-- MINERVA — Delta: cron schedule for recover-abandoned-signup, 2026-10-05.
-- Pre-filled with the project's real project ref/anon key, same pattern as
-- every other cron delta file. Run this once, AFTER ALL of:
--   1. supabase_schema_delta_signup_recovery.sql (adds
--      businesses.signup_recovery_sent_at, which this function reads/writes)
--   2. supabase_schema_delta_signup_recovery_registration.sql
--   3. recover-abandoned-signup has been deployed
--      (supabase functions deploy recover-abandoned-signup)
-- Kept separate from the DDL/registration deltas per this project's
-- established convention of never mixing DDL/DML and live cron.schedule()
-- calls.
-- ============================================================

-- Daily at 5:30am UTC (offset 30min from flag-abandoned-signups, its
-- same-domain sibling, to avoid stacking): email a business that started
-- signing up but never finished Stripe checkout, well before
-- flag-abandoned-signups writes it off as dead at the 48h mark.
select cron.schedule(
  'recover-abandoned-signup-daily',
  '30 5 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/recover-abandoned-signup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
