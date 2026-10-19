-- ============================================================
-- MINERVA — Combined Phase 4 SQL deltas (2026-10-19)
-- All 4 cron schedules from DEPLOY_RUNBOOK_PENDING.md's Phase 4,
-- concatenated into one paste. Run this AFTER Phase 1, Phase 2, and
-- Phase 3 (the functions these jobs call must already be deployed —
-- confirmed 2026-10-19 all 65 are live). Each cron.schedule() call is
-- pre-filled with the real project ref and anon key already, nothing
-- to fill in. Checked for schedule-time collisions against every
-- other cron.schedule() in this whole project before combining —
-- none of the 4 new times are unique (0 7 and 45 6 are shared with
-- existing jobs), but pg_cron already runs 8 other jobs at the same
-- */15 * * * * slot with no issue, so same-time overlap is not a
-- real problem, just noted for completeness.
-- ============================================================

-- ============================================================
-- FROM: supabase_schema_delta_signup_recovery_cron.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase_schema_delta_new_subscriber_checkin_cron.sql
-- ============================================================
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


-- ============================================================
-- FROM: supabase_schema_delta_trial_ending_reminder_cron.sql
-- ============================================================
-- ============================================================
-- MINERVA — Delta: cron schedule for notify-trial-ending, 2026-10-09.
-- Pre-filled with the project's real project ref/anon key, same pattern as
-- every other cron delta file. Run this once, AFTER notify-trial-ending
-- has been deployed.
-- Kept separate from the matching registration delta per this project's
-- established convention of never mixing DDL/DML and live cron.schedule()
-- calls.
-- ============================================================

-- Daily at 6:45am UTC (early-morning batch, same family as the 6:00/6:15
-- slots already in use, offset to avoid stacking): remind a business
-- when its main 7-day account trial is about to end and convert to a
-- real charge.
select cron.schedule(
  'notify-trial-ending-daily',
  '45 6 * * *',
  $$
  select net.http_post(
    url := 'https://xiikytqxevivrupkljwc.supabase.co/functions/v1/notify-trial-ending',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhpaWt5dHF4ZXZpdnJ1cGtsandjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxMjE5OTgsImV4cCI6MjEwMjY5Nzk5OH0.snBUk76EHmhKgRKeTN0-cuQa6qmqKzwJf_Q_JijyAPQ'
    ),
    body := '{}'::jsonb
  );
  $$
);


-- ============================================================
-- FROM: supabase_schema_delta_incoming_sms_webhook_cron.sql
-- ============================================================
-- ============================================================
-- MINERVA — incoming-sms-webhook retention cron, 2026-10-11. Run AFTER
-- supabase_schema_delta_incoming_sms_webhook.sql (needs the table to
-- already exist). Same 90-day pattern as
-- supabase_schema_delta_retention_cleanup.sql's own
-- cleanup-processed-call-sids-daily, kept as its own self-contained delta
-- rather than editing that already-deployed file.
-- ============================================================

select cron.schedule(
  'cleanup-processed-sms-sids-daily',
  '45 3 * * *',
  $$delete from processed_sms_sids where processed_at < now() - interval '90 days';$$
);

-- Verify after running:
--   select * from cron.job where jobname = 'cleanup-processed-sms-sids-daily'; -- expect: 1 row


