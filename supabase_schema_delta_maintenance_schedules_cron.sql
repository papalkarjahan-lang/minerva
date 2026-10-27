-- ============================================================
-- MINERVA — Delta: cron schedule for sweep-maintenance-schedules,
-- 2026-10-27. Pre-filled with the project's real project ref/anon key,
-- same pattern as every other cron delta file (see
-- supabase_schema_delta_signup_recovery_cron.sql). Run this once, AFTER
-- BOTH of:
--   1. supabase_schema_delta_maintenance_schedules.sql
--   2. sweep-maintenance-schedules has been deployed
--      (npx supabase functions deploy sweep-maintenance-schedules
--       --project-ref xiikytqxevivrupkljwc)
-- Kept separate from the DDL delta per this project's established
-- convention of never mixing DDL/DML and live cron.schedule() calls.
-- ============================================================

-- Daily at 23:00 UTC — checked against every cron.schedule() call in
-- every other *_cron.sql file in this repo first (times range from 03:45
-- to 23:00 UTC across the existing jobs; 23:00 on the dot was the one
-- free slot, nothing else registered there). Preventive maintenance is
-- never minute-sensitive, so an exact slot doesn't matter beyond avoiding
-- a collision.
select cron.schedule(
  'sweep-maintenance-schedules-daily',
  '0 23 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/sweep-maintenance-schedules',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
