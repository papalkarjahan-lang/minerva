-- ============================================================
-- MINERVA — sequence-handoffs nudge dedup (2026-09-28).
--
-- sequence-handoffs' cron sweep (every 15 min) re-scans every
-- 'task_complete' checkin from the last hour with no matching human
-- 'task_start' yet. Nothing marked a completion as "already nudged", so an
-- unhandled completion that stays unhandled for the full hour got a fresh
-- Slack "Pacer" nudge every 15 minutes — up to 4 duplicate nudges for the
-- same completion, contradicting index.ts's own header comment ("Nudges
-- Slack once per unhandled completion").
--
-- handoff_nudged_at lets the sweep atomically claim a completion checkin
-- before sending its Slack nudge (same claim-before-notify pattern as
-- chase-unpaid-invoices, fixed 2026-09-24), so each completion is only
-- ever nudged once.
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

alter table site_checkins add column if not exists handoff_nudged_at timestamptz;
