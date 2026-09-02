-- ============================================================
-- MINERVA - Delta: silent-automation escalation flags (2026-09-01)
-- Adds 3 new columns only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this enables: daily-digest now flags leads that got both autonomous
-- nurture texts and are still 'new' (no human ever picked them up), and
-- invoices that have had 3+ reminder SMS sent and are still unpaid — both
-- cases where the automation has done everything it can and a human needs
-- to step in. Each is only flagged once (via escalation_flagged_at) so the
-- digest doesn't repeat the same stuck item every day.
-- ============================================================

alter table leads add column escalation_flagged_at timestamptz;

alter table invoices add column reminder_count int default 0;
alter table invoices add column escalation_flagged_at timestamptz;
