-- ============================================================
-- MINERVA — Delta: cron schedule for flag-abandoned-signups, 2026-09-05.
-- Pre-filled with your real project ref/anon key (same values already used
-- in supabase_schema.sql's AUTONOMOUS AGENTS section and every other cron
-- delta file). Run this once, AFTER BOTH:
--   1. supabase_schema_delta_abandoned_signups.sql has been run (adds
--      businesses.abandoned_flagged_at, which this function reads/writes).
--   2. flag-abandoned-signups has been deployed
--      (supabase functions deploy flag-abandoned-signups).
-- Kept separate from the DDL delta per this project's established
-- convention of never mixing DDL and live cron.schedule() calls.
-- ============================================================

-- Once daily: flag (never delete) businesses stuck 48+ hours with no
-- completed Stripe checkout. See flag-abandoned-signups/index.ts header
-- comment for why this stays human-in-the-loop rather than auto-deleting.
select cron.schedule(
  'flag-abandoned-signups-daily',
  '0 5 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/flag-abandoned-signups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
