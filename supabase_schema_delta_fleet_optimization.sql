-- ============================================================
-- MINERVA — Delta: optimize-fleet-day support (2026-10-18)
-- Run once in the Supabase SQL Editor. Pure column addition, no RLS
-- change needed — businesses' existing SELECT/UPDATE policies already
-- cover this column the same way they cover every other business-owned
-- numeric field.
--
-- total_km_saved: a running, honestly-computed total of how much
-- distance optimize-fleet-day's plan beat the business's own actual
-- current assignment by, summed across every run that found a real
-- improvement (see that function's own header for the exact comparison —
-- it only ever adds a number here when the proposed plan is genuinely
-- shorter than what the business was already doing that day, never a
-- fabricated or best-case figure). Surfaced in DispatcherView.jsx as a
-- simple "distance saved so far" stat.
-- ============================================================

alter table businesses add column if not exists total_km_saved numeric default 0;

-- Verify:
-- select id, name, total_km_saved from businesses limit 5;
