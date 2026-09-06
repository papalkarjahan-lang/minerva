-- ============================================================
-- MINERVA - Delta: credential-aware auto-dispatch (2026-09-06)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this enables: a dispatcher can optionally set a required credential
-- name (e.g. "Electrical Licence") when creating a job. auto-assign-
-- technician then hard-excludes any candidate technician who doesn't hold a
-- currently-valid technician_credentials row with that exact name — a
-- compliance/safety hard filter, distinct from the existing Fair-Rotation
-- soft tiebreak (which never excludes anyone). Null by default = no
-- requirement, unchanged behaviour for every existing job/business.
-- ============================================================

alter table jobs add column required_credential_name text;
