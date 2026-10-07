-- ============================================================
-- MINERVA - Delta: 2 more index gaps found in a scale-readiness pass
-- (2026-10-08)
-- Adds 2 indexes only. Nothing else in your live DB is touched. Run this
-- entire block once in the Supabase SQL Editor (or via the Management API
-- /database/query, same as every other delta this project).
--
-- Why: supabase_schema_delta_cron_agent_indexes.sql (2026-09-24) added 6
-- partial indexes for the 4 cron functions fixed in that same round
-- (chase-unpaid-invoices, nurture-stale-leads, winback-lost-leads,
-- retention-checkin). A fresh scale-readiness pass (prompted by "capable
-- of serving hundreds of customers" becoming an explicit bar) found 2 more
-- hot-path predicates that round didn't cover, neither new — both queries
-- already existed, just never had supporting index coverage checked.
-- ============================================================

-- detect-wasted-trips runs every 15 minutes (the fastest cron cadence in
-- this app) and its candidate-job query filters
-- `status = 'scheduled' and no_show_detected_at is null` with no business
-- scoping (by design — it's a platform-wide sweep) and no LIMIT. 'scheduled'
-- is the single most common job status for any business with upcoming
-- work, so this has been a full sequential scan of the jobs table on every
-- run since this function was built, 96 times a day, growing slower as
-- historical job rows accumulate. Technician-id-keyed (not just a count)
-- since detect-wasted-trips' own query additionally filters
-- `not('technician_id', 'is', null)`.
create index if not exists idx_jobs_scheduled_no_show_pending
  on jobs (technician_id)
  where status = 'scheduled' and no_show_detected_at is null;

-- DispatcherView.jsx's generatePayrollHours() (an explicit owner-initiated
-- "Generate" click, not a cron sweep) filters technician_locations by
-- business_id plus a recorded_at range across every technician on that
-- business at once, for payroll hour calculations over a custom date
-- range. The existing (technician_id, recorded_at) index serves the
-- per-technician trail fetch (DispatcherView's live map detail panel)
-- well, but doesn't help a business-wide range scan — and
-- technician_locations is the single fastest-growing table in this
-- schema (one row per active technician every 15 seconds while tracking),
-- so this gap only gets more expensive over time, not less.
create index if not exists idx_technician_locations_business_recorded
  on technician_locations (business_id, recorded_at);

-- Verify after running the block above:
--
-- select indexname from pg_indexes
-- where tablename in ('jobs', 'technician_locations')
--   and indexname in ('idx_jobs_scheduled_no_show_pending', 'idx_technician_locations_business_recorded');
--
-- Expect both rows back.
