-- ============================================================
-- MINERVA — Delta: cron schedule for new-subscriber-checkin, 2026-10-05.
-- Pre-filled with the project's real project ref/anon key, same pattern as
-- every other cron delta file. Run this once, AFTER ALL of:
--   1. supabase_schema_delta_new_subscriber_checkin.sql (adds
--      businesses.founding_checkin_sent_at, which this function reads/writes)
--   2. supabase_schema_delta_new_subscriber_checkin_registration.sql
--   3. new-subscriber-checkin has been deployed
--      (supabase functions deploy new-subscriber-checkin)
-- Kept separate from the DDL/registration deltas per this project's
-- established convention of never mixing DDL/DML and live cron.schedule()
-- calls.
-- ============================================================

-- Daily at 7:00am UTC: email a business that's been a paying customer for
-- 14-21 days to ask how it's going. (Originally scheduled for 6:00am on
-- the claim that it was "a new, previously-unused slot" — it wasn't:
-- both supabase_schema_delta_minerva_max_cron.sql and
-- supabase_schema_delta_outreach_engine_cron.sql already use 0 6 * * *.
-- That claim was checked against only the 3 other cron files this
-- function's own comments happened to reference, not every *_cron.sql
-- file in the repo. Fixed before this was ever run, by actually grepping
-- every cron.schedule() call across the whole project this time.)
select cron.schedule(
  'new-subscriber-checkin-daily',
  '0 7 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/new-subscriber-checkin',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
