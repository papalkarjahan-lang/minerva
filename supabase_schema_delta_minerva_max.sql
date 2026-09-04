-- ============================================================
-- MINERVA - Delta: "Minerva Max" honest feature batch (2026-09-04)
-- Six new capabilities, all built from data Minerva already has or from
-- self-serve integrations with no partnership/licence gate:
--   1. Predictive maintenance (trend-based, not just threshold)
--   2. AI-verified checklist -> "ready to invoice" signal
--   3. Carbon/ESG estimate (published AU factors, labelled as an estimate)
--   4. Idle/ghost-asset detection
--   5. Subcontractor pool for dynamic dispatch
--   6. Xero OAuth connect groundwork (real self-serve API, no field mapping
--      live yet — see xero-oauth-connect/index.ts header for exact scope)
-- Run once in the Supabase SQL Editor. Purely additive.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Predictive maintenance — no new table needed, reuses
-- asset_telemetry_events (already has engine_hours + created_at per ping).
-- Just tracking last-ping time on the asset itself for idle detection (#4)
-- and to give predict-asset-maintenance a cheap "does this asset even have
-- recent data" check without scanning the whole events table every run.
-- ------------------------------------------------------------
alter table industrial_assets add column last_telemetry_at timestamptz;

-- ------------------------------------------------------------
-- 2. AI-verified checklist -> ready-to-invoice signal
-- ------------------------------------------------------------
alter table jobs add column ai_verified_at timestamptz; -- set once every checklist photo
                                                          -- for this job is AI-reviewed and
                                                          -- none are 'flagged'
alter table invoices add column ai_verified boolean default false; -- copied from the job at
                                                                     -- invoice-creation time, so
                                                                     -- the badge survives even
                                                                     -- if new unverified photos
                                                                     -- are added to the job later

-- ------------------------------------------------------------
-- 3. Carbon/ESG estimate — own table since it can attach to either a trade
-- job or an industrial site, and a business will want a filterable history
-- for tender attachments.
-- ------------------------------------------------------------
create table carbon_estimates (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid references businesses(id) on delete cascade,
  job_id            uuid references jobs(id) on delete cascade,
  site_id           uuid references site_projects(id) on delete cascade,
  distance_km       numeric,                 -- technician/asset transit distance this estimate covers
  vehicle_type      text default 'light_commercial', -- factor lookup key, see estimate-job-carbon/index.ts
  estimated_kg_co2e numeric not null,
  factor_basis      text not null,           -- which published factor set/version was used, for audit trail
  created_at        timestamptz default now()
);
alter table carbon_estimates enable row level security;
create policy "anon all carbon_estimates" on carbon_estimates
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- 5. Subcontractor pool
-- ------------------------------------------------------------
create table subcontractors (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  name            text not null,
  phone           text,
  skills          text[], -- free-text tags, e.g. '{electrical,confined_space}'
  hourly_rate     numeric,
  is_active       bool default true,
  current_lat     float8,
  current_lng     float8,
  last_seen       timestamptz,
  created_at      timestamptz default now()
);
alter table subcontractors enable row level security;
create policy "anon all subcontractors" on subcontractors
  for all using (true) with check (true);

-- jobs.assigned_subcontractor_id lets dispatch put a subcontractor on a job
-- the same way technician_id does, without disturbing any existing
-- technician_id logic (a job has at most one of the two set).
alter table jobs add column assigned_subcontractor_id uuid references subcontractors(id) on delete set null;

-- ------------------------------------------------------------
-- 6. Xero OAuth connect groundwork
-- Tokens are real OAuth secrets (not demo data) — deliberately NOT covered
-- by an "anon all" policy like the rest of this schema. Only service_role
-- (used exclusively by the xero-oauth-* edge functions, via
-- SUPABASE_SERVICE_ROLE_KEY, unlike every other function in this codebase
-- which uses the anon key + anon-all RLS) can read/write this table. See
-- xero-oauth-connect/index.ts header comment for the full reasoning.
-- ------------------------------------------------------------
create table integration_credentials (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  provider        text not null, -- 'xero' | 'myob' (myob not built yet, see README)
  tenant_id       text,          -- Xero org id, filled after the callback's tenant-select step
  access_token    text,
  refresh_token   text,
  expires_at      timestamptz,
  connected_at    timestamptz,
  created_at      timestamptz default now(),
  unique(business_id, provider)
);
alter table integration_credentials enable row level security;
-- No "anon all" policy on purpose. service_role bypasses RLS entirely, which
-- is exactly the point — nothing using the anon/authenticated key can read
-- these rows at all, including the browser.
grant select, insert, update, delete on integration_credentials to service_role;

-- businesses.xero_connected — cheap boolean the frontend (using the anon
-- key, like everywhere else) CAN read, so the UI can show "Connected" state
-- without ever touching the actual token table.
alter table businesses add column xero_connected boolean default false;

-- Set by xero-sync-invoice once a Minerva invoice has been pushed to Xero,
-- so the dispatcher UI can show "Synced to Xero" instead of re-pushing it.
alter table invoices add column xero_invoice_id text;

grant select, insert, update, delete on
  carbon_estimates, subcontractors
to anon, authenticated, service_role;
