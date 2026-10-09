-- ============================================================
-- MINERVA - Delta: main-trial-ending reminder (2026-10-09)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error. Run this entire block once in the
-- Supabase SQL Editor.
--
-- What this is for: Minerva Max add-on trials already get a reminder 3
-- days before they lapse (notify-addon-trial-ending,
-- businesses.max_addon_trials' own reminder_sent_at). The main account's
-- 7-day Stripe trial never had an equivalent, even though it ends in a
-- real card charge rather than a feature quietly turning off. There's no
-- local column to read a trial's end date from (it lives only on the
-- Stripe subscription object), so notify-trial-ending calls Stripe
-- directly per candidate business and this column is purely the
-- claim-before-act flag — same one-time-reminder shape as
-- signup_recovery_sent_at above.
-- ============================================================

alter table businesses add column trial_ending_reminder_sent_at timestamptz;
