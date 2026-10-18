-- ============================================================
-- MINERVA — Delta: allow roi_proposals' fuel-savings columns to be null,
-- 2026-10-18. Run once in the Supabase SQL Editor.
--
-- What this fixes: generate-roi-proposal's 15% fuel-savings figure is
-- specifically a route-optimization benchmark (see that function's own
-- header), which has no real mechanism behind it for industrial — no
-- route-optimization feature exists for that sector, and the work
-- pattern (equipment stationed at a multi-day site, not many short daily
-- jobs) doesn't fit the claim anyway. generate-roi-proposal/logic.ts's
-- new shouldComputeFuelSavings now skips generating a savings figure for
-- an industrial proposal rather than applying a claim that doesn't hold
-- for that sector — but estimated_monthly_fuel_savings/
-- estimated_annual_fuel_savings were both `not null`, so without this
-- delta every industrial proposal generation would fail outright with a
-- constraint violation instead of correctly omitting the claim.
-- avg_monthly_fuel_spend and estimated_minerva_monthly_cost stay not
-- null — those are still computed for every sector (fuel spend is
-- informational context, not a Minerva-driven claim; the cost estimate
-- doesn't depend on route optimization at all).
-- ============================================================

alter table roi_proposals alter column estimated_monthly_fuel_savings drop not null;
alter table roi_proposals alter column estimated_annual_fuel_savings drop not null;

-- Verify:
-- select column_name, is_nullable from information_schema.columns
-- where table_name = 'roi_proposals'
--   and column_name in ('estimated_monthly_fuel_savings', 'estimated_annual_fuel_savings');
-- Expect both rows showing is_nullable = 'YES'.
