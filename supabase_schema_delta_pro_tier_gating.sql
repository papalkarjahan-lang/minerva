-- ============================================================
-- MINERVA — Delta: Pro-tier feature server-side enforcement (2026-09-06,
-- frontend audit pass).
--
-- Same gap, same fix, as supabase_schema_delta_operational_fixes.sql's
-- crew_splitting trigger and supabase_schema_delta_subcontractor_pool_addon.sql's
-- subcontractor_pool trigger (see either file's header for the full "why a
-- trigger, not an RLS policy or edge function check" reasoning — this app
-- has no auth.uid()-scoped RLS by design).
--
-- What was missed: Onboarding.jsx's own pricing copy (TIERS constant)
-- describes "Pro" ($119/tech/mo) as "Everything in Standard + on-site
-- invoicing, asset tracking, compliance checklists" — i.e. these are the
-- actual paid-tier product differentiator, not a cosmetic label. But the
-- gate was frontend-only in three places:
--   - TechnicianView.jsx: invoice builder / materials-used / checklist flow
--     only shown when business.subscription_tier === 'pro', but
--     submitInvoice() inserts into `invoices` with no tier check.
--   - DispatcherView.jsx: Assets/Inventory tabs only rendered for
--     subscription_tier === 'pro', but AddAssetModal/AddInventoryItemModal
--     insert into `assets`/`inventory_items` with no tier check.
-- All three tables have anon-writable RLS (`with check (true)`), so any
-- Starter ($49) or Standard ($79) business could get Pro ($119) features
-- for free by calling supabase-js directly, bypassing the UI entirely —
-- a direct subscription-revenue bypass, not just a cosmetic UI gap.
--
-- Only guards INSERT, same as the existing triggers — never blocks
-- updating/removing an existing row even if the business later downgrades,
-- so nothing already created gets stuck un-editable.
-- ============================================================

create or replace function enforce_pro_tier_feature(p_business_id uuid, p_feature text) returns void as $$
declare
  tier text;
begin
  select subscription_tier into tier from businesses where id = p_business_id;
  if tier is distinct from 'pro' then
    raise exception '% is a Minerva Pro-tier feature — this business is on the % tier.', p_feature, coalesce(tier, 'unknown');
  end if;
end;
$$ language plpgsql;

create or replace function enforce_pro_tier_invoices() returns trigger as $$
begin
  perform enforce_pro_tier_feature(new.business_id, 'On-site invoicing');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_pro_tier_invoices on invoices;
create trigger trg_enforce_pro_tier_invoices
  before insert on invoices
  for each row execute function enforce_pro_tier_invoices();

create or replace function enforce_pro_tier_assets() returns trigger as $$
begin
  perform enforce_pro_tier_feature(new.business_id, 'Asset tracking');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_pro_tier_assets on assets;
create trigger trg_enforce_pro_tier_assets
  before insert on assets
  for each row execute function enforce_pro_tier_assets();

create or replace function enforce_pro_tier_inventory_items() returns trigger as $$
begin
  perform enforce_pro_tier_feature(new.business_id, 'Inventory/materials tracking');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_pro_tier_inventory_items on inventory_items;
create trigger trg_enforce_pro_tier_inventory_items
  before insert on inventory_items
  for each row execute function enforce_pro_tier_inventory_items();
