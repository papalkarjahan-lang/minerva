-- ============================================================
-- MINERVA — retention cleanup for technician_locations (2026-10-25).
--
-- Found while checking for the same "unbounded append-only table, no
-- cleanup path" shape just fixed for agent_insights
-- (supabase_schema_delta_agent_insights_retention.sql) — this table is a
-- much faster-growing case: TechnicianView.jsx pushes one row per active
-- technician every GPS_INTERVAL_MS (15 seconds) for the whole time
-- they're tracking, all day, every working day. At even a modest scale
-- (dozens of technicians across your customer base) this is easily the
-- fastest-growing table in the whole schema, by a wide margin — and it
-- has had zero cleanup path since it was created.
--
-- UNLIKE agent_insights, this is NOT a pure technical-housekeeping call:
-- DisputeView.jsx reads this table specifically as evidence for a
-- wage/hours or "nobody showed up" dispute (see its own table comment in
-- supabase_schema.sql: "no evidence for a dispute, no wage/hours
-- cross-check" was the whole reason it was built) — a genuine business/
-- record-keeping question, not something to decide unilaterally the way
-- a pure idempotency-log window was. RECORD_KEEPING_NOTES.md and
-- TAX_GST_NOTES.md already establish this business's own standard for
-- OTHER records (invoices, receipts, bank statements): "at least 5 years
-- — standard ATO requirement." This reuses that same already-decided
-- number as the default here too, on the reasoning that a wage/hours
-- dispute or an ATO audit of vehicle/travel expense claims could
-- plausibly want this evidence on a similar timeline — but this is an
-- extrapolation of an existing policy to a new kind of record, not a
-- restatement of a rule that explicitly names GPS data. ADJUST THE
-- INTERVAL BELOW if your own judgment (or your accountant's) says
-- otherwise before running this — unlike the agent_insights cleanup,
-- getting this number wrong has a real cost: too short loses genuine
-- dispute evidence, too long just costs a bit of extra storage.
--
-- Direct SQL DELETE via pg_cron, same pattern as every other retention
-- cleanup in this codebase — pure janitorial work, nothing to
-- kill-switch, runs well after business hours.
-- ============================================================

select cron.schedule(
  'cleanup-technician-locations-5y',
  '55 3 * * *',
  $$delete from technician_locations where created_at < now() - interval '5 years';$$
);

-- Verify after running:
--   select * from cron.job where jobname = 'cleanup-technician-locations-5y'; -- expect: 1 row
