-- ============================================================
-- MINERVA — Delta: sector guard on every sector-restricted Minerva Max
-- add-on, 2026-10-09. Adds 1 trigger only. Run this entire block once in
-- the Supabase SQL Editor.
--
-- Supersedes supabase_schema_delta_asset_intelligence_sector_guard.sql,
-- which this replaces before that file was ever run — don't run both.
--
-- What this fixes: src/maxAddons.js's MAX_ADDONS catalog originally
-- treated 'asset_intelligence' as the only add-on with a real sector
-- dependency (industrial-only: its backend reads exclusively from
-- industrial_assets). A full trace of the other 8 add-ons (2026-10-09,
-- see BILLING_INTEGRITY_NOTES.md's matching dated entry) found the
-- opposite problem at 8x the scale: every one of surge_pricing,
-- ai_quotes, crew_splitting, review_loop, demand_forecast,
-- subcontractor_pool, carbon_estimate, and xero_sync ultimately keys off
-- `jobs`/`invoices`/`quotes`, none of which IndustrialDispatcherView.jsx
-- ever populates (confirmed by grep — zero hits across all three tables
-- in that file). All 8 were purchasable and billable for an industrial
-- business while structurally guaranteed to never do anything.
--
-- Already fixed at 2 other layers, both committed separately:
--   - update-addon-billing/index.ts refuses the 'enable' action for a
--     sector-mismatched add-on BEFORE calling Stripe (the real,
--     paid-and-billed path) — this already covered asset_intelligence
--     and now covers all 9 via the same ADDON_REQUIRED_SECTOR map in
--     _shared/maxAddons.ts, no code change needed there.
--   - DispatcherView.jsx's add-on grid already filters generically via
--     isAddonAvailableForSector(addon.key, business?.sector)
--     (DispatcherView.jsx:3524) — extending the catalog's requiresSector
--     metadata was enough to make it correctly hide all 8 for... well,
--     DispatcherView.jsx is trade-only, so this was always a no-op there;
--     IndustrialDispatcherView.jsx never iterated MAX_ADDONS at all —
--     it hardcodes a single button for 'asset_intelligence' only, so
--     there was never a UI path exposing the other 8 to industrial
--     either. Neither UI gap is a real boundary on its own, same
--     established posture as every "forged-request" entry in
--     SECURITY_NOTES.md and the asset_intelligence guard below.
-- This trigger is the 3rd, defense-in-depth layer, and the only one that
-- covers startMaxAddonTrial's free-trial path specifically:
-- DispatcherView.jsx's and IndustrialDispatcherView.jsx's own
-- startMaxAddonTrial() (two separate copies, one per file) write
-- directly to `businesses` from the browser with NO edge function and NO
-- server-side check at all today — the frontend filter above is the
-- only thing stopping it, and a client-side-only gate is never treated
-- as sufficient on its own in this app.
--
-- Generalized rather than one-trigger-per-addon: 9 add-ons now share the
-- identical rule shape ("addon X requires sector Y"), the same
-- 2-or-more-call-sites threshold this codebase already uses elsewhere
-- (_shared/maxAddons.ts, _shared/tierEligibility.ts, _shared/batch.ts) to
-- justify one shared definition instead of N copies that can drift. The
-- mapping below is intentionally kept in lockstep with
-- ADDON_REQUIRED_SECTOR in supabase/functions/_shared/maxAddons.ts and
-- the requiresSector field in src/maxAddons.js's MAX_ADDONS — three
-- copies is the minimum possible given Postgres can't import
-- JS/TS, not a choice to generalize further.
--
-- Why this checks for a TRANSITION, not just current state: `businesses`
-- is updated constantly for completely unrelated reasons (subscription_
-- tier changes, Stripe ids, feature_priorities, ...), and max_addons/
-- max_addon_trials simply carry forward unchanged on every one of those
-- updates unless that specific statement touches them. A trigger that
-- rejected based on current value alone — rather than old vs. new — would
-- permanently brick EVERY future update to any business that ever ends up
-- with a sector-mismatched addon trial/flag set (whether from a past bug,
-- a manual fix, or a future sector change), since that stale value would
-- keep re-tripping the check forever. Comparing OLD and NEW means it only
-- fires when THIS statement is the one introducing or changing the
-- trial/flag — never when it's merely carried forward untouched — and
-- never blocks disabling (new_enabled going true→false always passes,
-- matching update-addon-billing's own "never block disable" rule).
-- ============================================================

drop trigger if exists trg_enforce_asset_intelligence_sector on businesses;
drop function if exists enforce_asset_intelligence_sector();

create or replace function enforce_addon_sector_restrictions() returns trigger as $$
declare
  addon_key text;
  required_sector text;
  new_enabled boolean;
  old_enabled boolean;
  new_trial jsonb;
  old_trial jsonb;
  -- Keep this mapping in lockstep with ADDON_REQUIRED_SECTOR in
  -- supabase/functions/_shared/maxAddons.ts and requiresSector in
  -- src/maxAddons.js's MAX_ADDONS. jsonb object literal so adding a
  -- 10th restricted add-on later is a one-line change here, not a new
  -- trigger.
  addon_sector_requirements jsonb := '{
    "asset_intelligence": "industrial",
    "surge_pricing": "trade",
    "ai_quotes": "trade",
    "crew_splitting": "trade",
    "review_loop": "trade",
    "demand_forecast": "trade",
    "subcontractor_pool": "trade",
    "carbon_estimate": "trade",
    "xero_sync": "trade"
  }'::jsonb;
begin
  for addon_key, required_sector in select * from jsonb_each_text(addon_sector_requirements)
  loop
    new_enabled := coalesce((new.max_addons ->> addon_key)::boolean, false);
    new_trial := new.max_addon_trials -> addon_key;
    old_enabled := false;
    old_trial := null;

    if TG_OP = 'UPDATE' then
      old_enabled := coalesce((old.max_addons ->> addon_key)::boolean, false);
      old_trial := old.max_addon_trials -> addon_key;
    end if;

    if new.sector is distinct from required_sector
       and ((new_enabled and not old_enabled) or (new_trial is not null and new_trial is distinct from old_trial)) then
      raise exception '"%" is only available for %-sector businesses — this business''s sector is %.', addon_key, required_sector, coalesce(new.sector, 'unknown');
    end if;
  end loop;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_addon_sector_restrictions on businesses;
create trigger trg_enforce_addon_sector_restrictions
  before insert or update on businesses
  for each row execute function enforce_addon_sector_restrictions();
