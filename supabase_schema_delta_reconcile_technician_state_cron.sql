-- ============================================================
-- MINERVA — Delta: cron schedule for reconcile-technician-state, 2026-09-05.
-- Pre-filled with the project's real project ref/anon key, same pattern as
-- every other cron delta file. Run this once, AFTER
-- reconcile-technician-state has been deployed
-- (supabase functions deploy reconcile-technician-state).
-- Kept separate from any DDL per this project's established convention of
-- never mixing DDL and live cron.schedule() calls. (This function needs
-- no new columns/tables, so there is no matching DDL delta file.)
-- ============================================================

-- Once daily: clear technicians.current_job_id when it's stuck pointing at
-- a job that's already 'complete' or no longer exists — see
-- reconcile-technician-state/index.ts header comment for the exact drift
-- scenario this fixes (a technician silently locked out of future
-- auto-dispatch because two sequential completion writes didn't both land).
select cron.schedule(
  'reconcile-technician-state-daily',
  '30 5 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/reconcile-technician-state',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
