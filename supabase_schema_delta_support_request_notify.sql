-- ============================================================
-- MINERVA - Delta: notify on new support request (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: support_requests has existed since 2026-09-05 and
-- AdminConsole.jsx has always been able to read/triage it, but nothing
-- has ever notified anyone that a new one arrived — someone hitting
-- "Contact support" got exactly as much response as however often the
-- operator happened to remember to check the Admin console's Support tab.
-- This column lets notify-new-support-request send that alert ONCE per
-- request, the moment it's submitted. Also requires OPERATOR_EMAIL to be
-- set (same secret stripe-webhook's payment_failed alert already uses) —
-- a harmless no-op until then, same as that one.
-- ============================================================

alter table support_requests add column notified_at timestamptz;
