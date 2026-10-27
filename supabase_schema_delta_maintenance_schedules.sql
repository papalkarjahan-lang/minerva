-- ============================================================
-- MINERVA — Delta: Preventive Maintenance Schedules (2026-10-27)
--
-- WHY: industrial_assets already has two reactive/predictive layers —
-- monitor-asset-telemetry (fires once engine_hours has ALREADY crossed
-- maintenance_interval_hours) and predict-asset-maintenance (projects
-- forward from real usage trend and fires a Slack warning days before).
-- Neither produces anything a human can actually assign, schedule ahead
-- of time, or track to completion — an owner has no way to say "service
-- this excavator every 250 hours" or "inspect this generator every 90
-- days" and have that turn into a real, assignable, closeable task on a
-- calendar. That's blueprint-grade "Maintenance & Inspections" (preventive
-- maintenance, maintenance calendars, technician assignment, maintenance
-- history) — a real module gap, not a duplicate of what already exists.
--
-- Deliberately reuses corrective_actions (supabase_schema_delta_
-- corrective_actions.sql) as the work-order object instead of inventing a
-- parallel work_orders table — that table's own header comment says
-- source_type is free text specifically so a future flagging agent could
-- create rows without a migration. This is that future agent. A raised
-- maintenance work order is a corrective_actions row with
-- source_type='maintenance_schedule', source_id=maintenance_schedules.id
-- — it shows up in the existing assign/due-date/close UI for free.
--
-- Scoped under the existing asset_intelligence Minerva Max add-on (same
-- data domain, same buyer as predict-asset-maintenance/detect-idle-assets)
-- rather than a new SKU — see maxAddons.js's updated description.
--
-- Trigger model: 'meter' (due when asset.engine_hours - last_completed_
-- hours >= interval_hours) or 'calendar' (due when now >= last_completed_
-- at + interval_days, or immediately if never completed). Computed at
-- sweep time, not stored as a next-due column, so there's nothing to go
-- stale.
--
-- work_order_raised_at is the same claim-before-notify column pattern as
-- industrial_assets.maintenance_predicted_at (added 2026-09-29) — set the
-- instant a work order is raised, cleared back to null when that work
-- order closes (see closeCorrectiveAction's handling of source_type=
-- 'maintenance_schedule' in IndustrialDispatcherView.jsx), so the sweep
-- never raises a second duplicate ticket while one is still open, and a
-- concurrent overlapping run can't double-raise either.
--
-- RLS: owner-scoped from creation (not "anon all") — matches the current
-- best-practice shape this project settled on via rls_scoping_v1..v5
-- (industrial_assets, corrective_actions, subcontractors, etc.), not the
-- original-and-since-corrected "anon all" shape those deltas had to walk
-- back. Grants listed explicitly alongside the policies — rls_scoping_v4
-- hit a real "permission denied for table corrective_actions" (42501)
-- that was a missing GRANT, not an RLS gap, so this file does both up
-- front instead of risking the same two-step bug.
--
-- Safe to run any time — `create table if not exists` / `drop policy if
-- exists` throughout, so re-running this file is harmless.
-- ============================================================

create table if not exists maintenance_schedules (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid references businesses(id) on delete cascade,
  asset_id              uuid references industrial_assets(id) on delete cascade,
  title                 text not null, -- e.g. "250-hour service", "Annual safety inspection"
  trigger_type          text not null default 'meter', -- 'meter' | 'calendar'
  interval_hours        numeric, -- required when trigger_type = 'meter'
  interval_days         integer, -- required when trigger_type = 'calendar'
  last_completed_at     timestamptz,
  last_completed_hours  numeric,
  instructions          text,
  active                boolean not null default true,
  work_order_raised_at  timestamptz, -- claim column; see header comment
  created_at            timestamptz not null default now()
);

alter table maintenance_schedules enable row level security;

drop policy if exists "owner select maintenance_schedules" on maintenance_schedules;
drop policy if exists "owner insert maintenance_schedules" on maintenance_schedules;
drop policy if exists "owner update maintenance_schedules" on maintenance_schedules;
drop policy if exists "owner delete maintenance_schedules" on maintenance_schedules;

create policy "owner select maintenance_schedules" on maintenance_schedules
  for select using (
    exists (select 1 from businesses b where b.id = maintenance_schedules.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner insert maintenance_schedules" on maintenance_schedules
  for insert with check (
    exists (select 1 from businesses b where b.id = maintenance_schedules.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner update maintenance_schedules" on maintenance_schedules
  for update using (
    exists (select 1 from businesses b where b.id = maintenance_schedules.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner delete maintenance_schedules" on maintenance_schedules
  for delete using (
    exists (select 1 from businesses b where b.id = maintenance_schedules.business_id and b.owner_user_id = auth.uid())
  );

-- service_role is the sweep function's own key (bypasses RLS, but needs
-- the grant to touch the table at all); anon/authenticated need it for
-- the owner-authenticated frontend client, consistent with every other
-- owner-scoped table added since rls_scoping_v4's permission-grant fix.
grant select, insert, update, delete on maintenance_schedules to anon, authenticated, service_role;

create index if not exists idx_maintenance_schedules_business on maintenance_schedules(business_id);
create index if not exists idx_maintenance_schedules_asset on maintenance_schedules(asset_id);

-- Registers the new sweep function so it shows up in agent health checks
-- immediately rather than waiting for its first run (record_agent_run
-- would auto-insert it anyway, but with agent='core' instead of the
-- correct grouping). Safe no-op if already present.
insert into agent_functions (name, agent) values
  ('sweep-maintenance-schedules', 'industrial')
on conflict (name) do nothing;

-- Cron registration is kept in its own file (never mixed with DDL/DML in
-- this project's convention) — see
-- supabase_schema_delta_maintenance_schedules_cron.sql. Run that one
-- AFTER deploying the function:
--   npx supabase functions deploy sweep-maintenance-schedules --project-ref xiikytqxevivrupkljwc
