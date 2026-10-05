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

-- Daily at 7:30am UTC: email a business that started signing up but never
-- finished Stripe checkout, well before flag-abandoned-signups writes it
-- off as dead at the 48h mark. (Originally scheduled for 5:30am as an
-- "offset from flag-abandoned-signups" without checking every OTHER
-- cron file first — 5:30 turned out to already be reconcile-technician-
-- state's own slot. Fixed before this was ever run; verified against
-- every cron.schedule() call in every *_cron.sql file in this repo, not
-- just the one sibling this function happens to share a table/comment
-- lineage with.)
select cron.schedule(
  'recover-abandoned-signup-daily',
  '30 7 * * *',
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
