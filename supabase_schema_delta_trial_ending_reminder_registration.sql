-- ============================================================
-- MINERVA — Delta: register notify-trial-ending with the Agent OS
-- (2026-10-09). Run once, alongside
-- supabase_schema_delta_trial_ending_reminder_cron.sql, after
-- supabase_schema_delta_trial_ending_reminder.sql (needs that column to
-- exist first). Same registration pattern as every other cron agent —
-- see supabase_schema_delta_addon_trial_reminder_registration.sql.
-- 'finance' category, same as reconcile-billing — this is about an
-- existing signed-up business's own billing/account state, not outreach
-- to a prospect.
-- ============================================================

insert into agent_functions (name, agent) values
  ('notify-trial-ending', 'finance')
on conflict (name) do nothing;
