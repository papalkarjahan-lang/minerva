-- ============================================================
-- MINERVA - Delta: notify on new inbound enterprise lead (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: supabase_schema_delta_enterprise_inbound.sql
-- (2026-09-14) let a real multi-van fleet/facilities-management company/
-- council/strata manager self-identify via the public /enterprise page,
-- but nothing has ever notified the operator that one arrived — the only
-- other function touching this table (generate-roi-proposal) reads an
-- existing row, it doesn't fire on insert. This column lets
-- notify-new-enterprise-lead email that lead ONCE, the moment it's
-- submitted. Also requires OPERATOR_EMAIL to be set (same secret
-- stripe-webhook's payment_failed alert already uses) — a harmless no-op
-- until then, same as that one.
-- ============================================================

alter table big_account_targets add column notified_at timestamptz;
