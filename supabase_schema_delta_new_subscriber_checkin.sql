-- ============================================================
-- MINERVA - Delta: new-paying-customer check-in email (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: retention-checkin already maintains a trade business's
-- relationship with ITS OWN clients. Nothing maintains Minerva's own
-- relationship with its paying business customers in the first couple of
-- weeks after they convert — exactly when a rough edge either gets
-- reported or quietly causes churn later. This column lets
-- new-subscriber-checkin email that business ONCE, 14-21 days after
-- signup. Same self-healing/one-time-claim shape as every other
-- *_sent_at flag in this schema.
-- ============================================================

alter table businesses add column founding_checkin_sent_at timestamptz;
