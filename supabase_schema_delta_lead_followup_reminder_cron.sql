-- ============================================================
-- MINERVA — Delta: cron schedule for lead-followup-reminder, 2026-09-30.
-- Pre-filled with the project's real project ref/anon key, same pattern as
-- every other cron delta file. Run this once, AFTER lead-followup-reminder
-- has been deployed.
-- Kept separate from the matching DDL delta
-- (supabase_schema_delta_lead_followup_reminder.sql) per this project's
-- established convention of never mixing DDL and live cron.schedule()
-- calls.
-- ============================================================

-- Every 15 minutes: alert a business via Slack when one of its leads'
-- next_action_at follow-up reminder comes due. Cheap query (indexed,
-- usually zero rows), so a tight cadence costs nothing and keeps the
-- reminder prompt.
select cron.schedule(
  'lead-followup-reminder-15min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/lead-followup-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
