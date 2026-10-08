-- ============================================================
-- MINERVA — Delta: sector guard on the asset_intelligence add-on, 2026-10-08.
-- Adds 1 trigger only. Run this entire block once in the Supabase SQL
-- Editor.
--
-- What this fixes: "Asset Intelligence" is sold (src/maxAddons.js's
-- MAX_ADDONS catalog) as a standalone, per-business Minerva Max add-on
-- available to enable from either dispatcher console, same as the other
-- 8. But its entire real backend — detect-idle-assets,
-- predict-asset-maintenance — reads exclusively from `industrial_assets`.
-- A trade-sector business has no rows there at all (their own equipment
-- lives in the separate, Pro-tier-gated `assets` table, which those two
-- functions never touch), so enabling this for a trade business charges
-- real money every month for a feature structurally guaranteed to never
-- do anything. Checked every other add-on's backend — this is the only
-- one with a real sector dependency; see BILLING_INTEGRITY_NOTES.md's
-- matching dated entry for the full writeup, including why this isn't
-- "build a trade-sector equivalent" (that's a real product decision,
-- not a bug fix, and trade `assets` has no telemetry/idle concept to
-- build on today).
--
-- Already fixed at 2 other layers, both committed separately:
--   - update-addon-billing/index.ts now refuses the 'enable' action for
--     a sector-mismatched add-on BEFORE calling Stripe (the real,
--     paid-and-billed path).
--   - DispatcherView.jsx no longer even renders asset_intelligence's
--     Enable/Trial buttons for a trade-sector business (the only normal
--     way to reach either path).
-- This trigger is the 3rd, defense-in-depth layer, and the only one that
-- covers startMaxAddonTrial's free-trial path specifically:
-- DispatcherView.jsx's startMaxAddonTrial() writes directly to
-- `businesses` from the browser with NO edge function and NO server-side
-- check at all today — the frontend filter above is the only thing
-- stopping it, and this app's established posture (see
-- supabase_schema_delta_pro_tier_gating.sql and every "forged-request"
-- entry in SECURITY_NOTES.md) is that a client-side-only gate is never
-- treated as sufficient on its own.
--
-- Why this checks for a TRANSITION, not just current state: `businesses`
-- is updated constantly for completely unrelated reasons (subscription_
-- tier changes, Stripe ids, feature_priorities, ...), and max_addons/
-- max_addon_trials simply carry forward unchanged on every one of those
-- updates unless that specific statement touches them. A trigger that
-- rejected based on current value alone — rather than old vs. new — would
-- permanently brick EVERY future update to any business that ever ends up
-- with an asset_intelligence trial/flag set while non-industrial (whether
-- from a past bug, a manual fix, or a future sector change), since that
-- stale value would keep re-tripping the check forever. Comparing OLD and
-- NEW means it only fires when THIS statement is the one introducing or
-- changing the trial/flag — never when it's merely carried forward
-- untouched — and never blocks disabling (new_enabled going true→false
-- always passes, matching update-addon-billing's own "never block
-- disable" rule).
-- ============================================================

create or replace function enforce_asset_intelligence_sector() returns trigger as $$
declare
  new_enabled boolean := coalesce((new.max_addons ->> 'asset_intelligence')::boolean, false);
  new_trial jsonb := new.max_addon_trials -> 'asset_intelligence';
  old_enabled boolean := false;
  old_trial jsonb := null;
begin
  if TG_OP = 'UPDATE' then
    old_enabled := coalesce((old.max_addons ->> 'asset_intelligence')::boolean, false);
    old_trial := old.max_addon_trials -> 'asset_intelligence';
  end if;

  if new.sector is distinct from 'industrial'
     and ((new_enabled and not old_enabled) or (new_trial is not null and new_trial is distinct from old_trial)) then
    raise exception 'Asset Intelligence (asset_intelligence) is only available for Industrial-sector businesses — this business''s sector is %.', coalesce(new.sector, 'unknown');
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_asset_intelligence_sector on businesses;
create trigger trg_enforce_asset_intelligence_sector
  before insert or update on businesses
  for each row execute function enforce_asset_intelligence_sector();
