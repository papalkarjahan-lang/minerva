-- ============================================================
-- MINERVA — Delta: Trade-sector equipment maintenance scheduling (2026-10-29)
--
-- WHY: maintenance_schedules (supabase_schema_delta_maintenance_schedules.sql,
-- 2026-10-27) already gives industrial a real multi-trigger PM engine
-- ('meter' — due when engine_hours crosses a threshold — or 'calendar' —
-- due on a date interval), raising an assignable, closeable work order the
-- moment something's due. Trade's own equipment tracking (`assets`, Pro
-- tier) was never given the same thing — it's a static status flag
-- (available/in_use/maintenance) with zero maintenance intelligence. A
-- generator or compressor can sit needing its 250-hour service with
-- nothing anywhere flagging it. Found while comparing Minerva's real,
-- built feature set against industry-standard CMMS products — multi-
-- trigger (date-or-usage) preventive maintenance is the baseline those
-- products are judged on, and trade had none of it.
--
-- Reuses the existing engine rather than duplicating it: makes
-- maintenance_schedules sector-agnostic (it was hard-FK'd to
-- industrial_assets only) via a new asset_sector discriminator, and adds
-- the one column trade equipment needs to support meter-based triggers
-- (industrial already has assets.engine_hours; trade gets the equivalent
-- usage_hours — optional, left at 0 for equipment that's calendar-only).
--
-- Deliberately does NOT reuse sweep-maintenance-schedules' ticket-raising
-- path (which creates a corrective_actions row — an industrial-only
-- table/workflow). Trade's UI instead computes "service due" client-side
-- from the same schedule + asset data (see isAssetServiceDue in
-- src/utils.js) and offers a direct "Mark serviced" action — simpler,
-- matches trade's existing lighter-weight UX (no ticket/assignment layer
-- anywhere else in the trade dispatcher), and makes zero changes to the
-- industrial sweep function or its tested behavior.
--
-- Ships as part of the existing Pro-tier "Asset tracking" feature, not a
-- new Minerva Max add-on — this is a natural extension of a feature Pro
-- subscribers already pay for, not a new SKU to sell separately.
--
-- Safe to run any time — guarded throughout, re-running is harmless.
-- ============================================================

-- The original FK only let asset_id point at industrial_assets; trade
-- schedules need to point at `assets` instead. asset_sector says which.
alter table maintenance_schedules drop constraint if exists maintenance_schedules_asset_id_fkey;
alter table maintenance_schedules add column if not exists asset_sector text not null default 'industrial'; -- 'industrial' | 'trade'

alter table assets add column if not exists usage_hours numeric default 0;

-- Dropping the FK means Postgres no longer cascade-deletes a sector's
-- maintenance_schedules rows when its asset is deleted. Replace that with
-- explicit, sector-scoped triggers so deleting an asset still cleans up
-- after itself exactly as before (and an industrial deletion can never
-- touch a trade row or vice versa).
create or replace function cascade_delete_trade_asset_maintenance_schedules() returns trigger as $$
begin
  delete from maintenance_schedules where asset_id = old.id and asset_sector = 'trade';
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_cascade_trade_asset_maintenance on assets;
create trigger trg_cascade_trade_asset_maintenance
  before delete on assets
  for each row execute function cascade_delete_trade_asset_maintenance_schedules();

create or replace function cascade_delete_industrial_asset_maintenance_schedules() returns trigger as $$
begin
  delete from maintenance_schedules where asset_id = old.id and asset_sector = 'industrial';
  return old;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_cascade_industrial_asset_maintenance on industrial_assets;
create trigger trg_cascade_industrial_asset_maintenance
  before delete on industrial_assets
  for each row execute function cascade_delete_industrial_asset_maintenance_schedules();

create index if not exists idx_maintenance_schedules_asset_sector on maintenance_schedules(asset_sector);

-- Verify after running:
--   select asset_sector, count(*) from maintenance_schedules group by asset_sector;
-- should show existing rows all as 'industrial', zero errors.
