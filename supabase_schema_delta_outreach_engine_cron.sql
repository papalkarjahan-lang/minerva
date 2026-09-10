-- ============================================================
-- MINERVA — Delta: cron schedule for followup-outreach, 2026-09-10.
-- Pre-filled with your real project ref/anon key (same values already used
-- in every other cron delta file). Run this once, AFTER BOTH:
--   1. supabase_schema_delta_outreach_engine.sql has been run.
--   2. followup-outreach has been deployed
--      (supabase functions deploy followup-outreach).
-- Kept separate from the DDL delta per this project's established
-- convention of never mixing DDL and live cron.schedule() calls.
--
-- draft-outreach-batch and send-outreach-batch are deliberately NOT
-- scheduled here — both are on-demand only, triggered from the admin
-- console's Outreach tab ("Draft new" / "Send approved" buttons), never on
-- a timer. Only the drafting of follow-ups (never the sending) runs
-- automatically.
-- ============================================================

-- Once daily: draft (never send) the next follow-up for any prospect who
-- was emailed and hasn't replied, once their 3/7/14-day window is up. See
-- followup-outreach/index.ts header comment for the full stage logic.
select cron.schedule(
  'followup-outreach-daily',
  '0 6 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/followup-outreach',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);
