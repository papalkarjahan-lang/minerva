-- ============================================================
-- MINERVA - Delta: dedup columns for send-job-assignment-sms, plus a
-- unique constraint enabling upsert-based dedup in estimate-job-carbon
-- (2026-09-30). Run this once in the Supabase SQL Editor (or via the
-- Management API /database/query endpoint). Safe any time — additive
-- only, no data changes to existing rows.
--
-- 1. send-job-assignment-sms had NO server-side idempotency at all: a
--    flaky-connection resubmit from DispatcherView's assignJob(), a
--    duplicate DB-trigger fire from auto-assign-technician, or a manual
--    replay of the same {jobId, technicianId} pair could text the same
--    real technician (and the real previous technician being bumped
--    off) twice. Fixed with the same claim-before-notify pattern as
--    send-eta-sms/send-invoice-sms: atomically claim
--    {technician_notified_at, technician_notified_for} before sending,
--    scoped so a genuine reassignment (different technicianId) is still
--    allowed through, and released on a send failure so a transient
--    Twilio/network error doesn't permanently block a real retry.
--
-- 2. estimate-job-carbon's daily cron window is a rolling "last 24h",
--    not a strict once-per-calendar-day guarantee — an overlapping or
--    duplicate run would see the same set of completed jobs for a
--    technician and insert a SECOND carbon_estimates row anchored to
--    the same last-job-of-the-day, double-counting that day's CO2-e in
--    any report/tender that sums the table. Fixed by switching the
--    plain insert to an upsert keyed on job_id (each job has exactly
--    one technician, so job_id already uniquely anchors one estimate
--    per technician-day) — this requires a unique constraint on
--    carbon_estimates.job_id, added below.

alter table jobs add column if not exists technician_notified_at timestamptz;
alter table jobs add column if not exists technician_notified_for uuid references technicians(id) on delete set null;

-- NOTE: if this statement fails with a duplicate-key error, it means the
-- pre-fix bug already produced duplicate rows for the same job_id — check
-- `select job_id, count(*) from carbon_estimates group by job_id having
-- count(*) > 1` and delete the extras (keep the earliest `created_at` per
-- job_id) before re-running this line.
alter table carbon_estimates add constraint carbon_estimates_job_id_key unique (job_id);
