-- ============================================================
-- MINERVA - Delta: 'invoice.overdue' custom-workflow trigger (2026-09-27)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this enables: run-custom-workflows' cron sweep (already scheduled
-- every 15 min, see supabase_schema_delta_agent_cron.sql) can now find
-- unpaid invoices 3+ days old and fire a business's own active
-- 'invoice.overdue' custom_workflows rows for them — previously this
-- trigger_event existed nowhere (the sweep was a documented no-op).
-- workflow_overdue_notified_at is set once per invoice (atomic
-- claim-before-run in run-custom-workflows/index.ts) so a business's
-- workflow fires exactly once per invoice, not every 15-minute tick.
-- Null by default = not yet notified, unchanged behaviour for every
-- existing invoice until it actually qualifies.
-- ============================================================

alter table invoices add column if not exists workflow_overdue_notified_at timestamptz;
