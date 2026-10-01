-- ============================================================
-- MINERVA - Delta: skill-aware auto-dispatch (2026-09-27)
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this enables: a dispatcher can optionally set a required skill tag
-- (e.g. "confined_space") when creating a job. auto-assign-technician then
-- hard-excludes any candidate technician whose technicians.skills list
-- doesn't contain that exact tag — same hard-exclude pattern as the
-- existing required_credential_name filter, applied independently. Null by
-- default = no requirement, unchanged behaviour for every existing
-- job/business.
--
-- CORRECTION (2026-10-01): the original version of this comment claimed
-- technicians.skills "already existed" via supabase_schema_delta_
-- minerva_max.sql — that was wrong. That delta only added a `skills`
-- column to the separate `subcontractors` table, never to `technicians`.
-- The column was genuinely missing from the live DB from this delta's
-- original 2026-09-27 rollout until discovered and fixed 2026-10-01 — see
-- auto-assign-technician/index.ts's header comment and its new `techsErr`
-- check for how this silently degraded every auto-dispatch in the
-- meantime (the technicians select failed, its error was previously
-- discarded, so every job fell through to "no technician free"). Added
-- below, where it should have been from the start.
-- ============================================================

alter table jobs add column if not exists required_skill text;
alter table technicians add column if not exists skills text[];
