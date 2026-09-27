-- ============================================================
-- MINERVA - Delta: skill-aware auto-dispatch (2026-09-27)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this enables: a dispatcher can optionally set a required skill tag
-- (e.g. "confined_space") when creating a job. auto-assign-technician then
-- hard-excludes any candidate technician whose technicians.skills list
-- (text[], already added by supabase_schema_delta_minerva_max.sql but
-- unused until now) doesn't contain that exact tag — same hard-exclude
-- pattern as the existing required_credential_name filter, applied
-- independently. Null by default = no requirement, unchanged behaviour for
-- every existing job/business.
-- ============================================================

alter table jobs add column if not exists required_skill text;
