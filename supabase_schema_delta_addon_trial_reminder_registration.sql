-- ============================================================
-- MINERVA — Delta: register notify-addon-trial-ending with the Agent OS
-- (2026-09-30). No new columns needed — the reminder-sent flag lives
-- inside businesses.max_addon_trials' own per-addon JSON object
-- (`reminder_sent_at`, alongside the existing `started_at`/`ends_at`),
-- which already exists (supabase_schema_delta_minerva_max_tier.sql).
-- Same registration pattern as every other cron agent — see
-- supabase_schema_delta_followup_outreach_agent_registration.sql.
-- Run once, alongside supabase_schema_delta_addon_trial_reminder_cron.sql.
-- ============================================================

insert into agent_functions (name, agent) values
  ('notify-addon-trial-ending', 'outreach')
on conflict (name) do nothing;
