-- ============================================================
-- MINERVA - Delta: Industrial Sector (Track B, 2026-09-01)
-- Adds a second, parallel sector alongside the existing AU trade-business
-- product: B2B heavy-equipment / industrial field operations. Built as an
-- ADDITIVE sector, not a replacement — existing trade-business tables,
-- functions, and RLS are completely untouched by this file.
-- Standalone — only touches NEW tables/columns, won't hit "already exists".
-- Run this entire block once in the Supabase SQL Editor, any time after
-- the main schema (order relative to supabase_schema_delta_agent_expansion.sql
-- doesn't matter, they don't reference each other).
--
-- IMPORTANT HONESTY NOTE (read before wiring this to real data):
-- This schema and its edge functions (see README) give you a fully working
-- data model, ingestion API, and alerting/coordination logic for the
-- industrial sector. It does NOT include an actual connection to any real
-- external industrial lead registry, LinkedIn, RFID/Bluetooth reader
-- hardware, drone systems, or mesh network — those don't exist as
-- accessible APIs Minerva can be wired to without a real account/contract
-- with a specific vendor (and in some cases, e.g. scraping LinkedIn,
-- would violate that platform's terms of service and isn't something this
-- build will do). Every ingestion point below is a real, working POST
-- endpoint ready to receive that data the moment you have a real source for
-- it (a telemetry vendor's webhook, a CSV export from a registry, a manual
-- entry form) — see each edge function's header comment for exactly what
-- it expects and where the "plug in a real feed here" seam is.
-- ============================================================

-- New sector flag on the existing businesses table. Defaults to 'trade' so
-- every existing business is unaffected. Only businesses with
-- sector='industrial' see the Industrial console / are scanned by the
-- industrial agent functions below.
alter table businesses add column sector text default 'trade'; -- 'trade' | 'industrial'

-- Per-business shared secret for the two unauthenticated (--no-verify-jwt)
-- ingestion webhooks below (harvest-industrial-leads, monitor-asset-telemetry).
-- Auto-generated on column add so every existing business gets a real key
-- for free — a real vendor feed or CSV-import script must send it back as
-- the `X-Ingestion-Key` header or the request is rejected with 401. Closes
-- the gap documented in SECURITY_NOTES.md ("a stronger case for adding a
-- per-business shared-secret header... rather than leaving it open-ended").
alter table businesses add column ingestion_key text default gen_random_uuid()::text;

-- ------------------------------------------------------------
-- Asset Tracking & Lifecycle Domain (Telemetry + Audit)
-- ------------------------------------------------------------
create table industrial_assets (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid references businesses(id) on delete cascade,
  name                  text not null, -- e.g. "Excavator #3", "Trencher B"
  asset_type            text, -- free text: 'excavator' | 'generator' | 'compressor' | ...
  tag_id                text, -- RFID/Bluetooth tag identifier, once a real reader feed exists
  current_lat           double precision,
  current_lng           double precision,
  engine_hours          numeric default 0,
  maintenance_interval_hours numeric default 250, -- alert threshold, Audit checks against this
  last_maintenance_at_hours  numeric default 0,
  geofence_site_id      uuid, -- references site_projects(id), nullable — set when assigned to a site
  status                text default 'active', -- 'active' | 'maintenance' | 'idle' | 'out_of_service'
  created_at            timestamptz default now()
);
alter table industrial_assets enable row level security;
create policy "anon all industrial_assets" on industrial_assets
  for all using (true) with check (true);

create table asset_telemetry_events (
  id              uuid primary key default gen_random_uuid(),
  asset_id        uuid references industrial_assets(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  event_type      text not null, -- 'ping' | 'geofence_breach' | 'maintenance_due'
  lat             double precision,
  lng             double precision,
  engine_hours    numeric,
  detail          text,
  created_at      timestamptz default now()
);
alter table asset_telemetry_events enable row level security;
create policy "anon all asset_telemetry_events" on asset_telemetry_events
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- Lead Gathering & Intent Domain (Signal + Enrich)
-- ------------------------------------------------------------
create table industrial_leads (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid references businesses(id) on delete cascade,
  company_name          text not null,
  source                text, -- 'manual' | 'csv_import' | 'registry_import' — see harvest-industrial-leads
  intent_signal         text, -- free text note on why this lead looks active (permit filed, RFQ posted, etc.)
  decision_maker_name   text, -- filled by enrich-industrial-leads once contact info is provided/imported
  decision_maker_title  text,
  decision_maker_contact text,
  equipment_need        text,
  estimated_size        text, -- 'small' | 'mid' | 'enterprise' — rough sizing signal
  status                text default 'new', -- 'new' | 'enriched' | 'contacted' | 'converted' | 'lost'
  created_at            timestamptz default now()
);
alter table industrial_leads enable row level security;
create policy "anon all industrial_leads" on industrial_leads
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- Active Site Operations Domain (Tempo the conductor, and its subagents:
-- The Operator / The Warden / The Pacer / The Quartermaster / The Closer)
-- ------------------------------------------------------------
create table site_projects (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  industrial_lead_id uuid references industrial_leads(id) on delete set null,
  name            text not null,
  scope_of_work   text, -- the SOW Tempo initializes from
  site_lat        double precision,
  site_lng        double precision,
  geofence_radius_m numeric default 200,
  status          text default 'active', -- 'active' | 'complete' | 'on_hold'
  created_at      timestamptz default now()
);
alter table site_projects enable row level security;
create policy "anon all site_projects" on site_projects
  for all using (true) with check (true);

create table site_checkins (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid references site_projects(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  person_name     text,
  role            text, -- 'human_technician' | 'automated_process' — used by The Warden to
                         -- detect a human/machine proximity conflict in the same zone
  checkin_type    text, -- 'arrival' | 'departure' | 'task_start' | 'task_complete'
  detail          text,
  created_at      timestamptz default now()
);
alter table site_checkins enable row level security;
create policy "anon all site_checkins" on site_checkins
  for all using (true) with check (true);

create table safety_incidents (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid references site_projects(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  severity        text default 'warning', -- 'warning' | 'hazard'
  description     text not null,
  acknowledged_at timestamptz,
  created_at      timestamptz default now()
);
alter table safety_incidents enable row level security;
create policy "anon all safety_incidents" on safety_incidents
  for all using (true) with check (true);

create table consumables_items (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid references site_projects(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  name            text not null, -- e.g. "Welding wire", "Hydraulic fluid"
  unit            text default 'units',
  quantity_on_hand numeric default 0,
  reorder_threshold numeric default 0,
  reorder_requested_at timestamptz, -- set once by track-consumables when it first drops below
                                     -- threshold, so the same low-stock item doesn't re-alert
                                     -- every run — cleared manually when restocked.
  created_at      timestamptz default now()
);
alter table consumables_items enable row level security;
create policy "anon all consumables_items" on consumables_items
  for all using (true) with check (true);

create table client_verification_packages (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid references site_projects(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  summary         text, -- Closer-generated plain-language summary for the client
  evidence        jsonb, -- assembled snapshot: checkins, telemetry summary, safety log at time of packaging
  signed_off_at   timestamptz,
  created_at      timestamptz default now()
);
alter table client_verification_packages enable row level security;
create policy "anon all client_verification_packages" on client_verification_packages
  for all using (true) with check (true);

-- Table-level grants — RLS policies above are inert without these (see the
-- 2026-09-02 outage note in supabase_schema.sql's ROW LEVEL SECURITY
-- section for the full story of why this line can't be skipped).
grant select, insert, update, delete on
  industrial_assets, asset_telemetry_events, industrial_leads,
  site_projects, site_checkins, safety_incidents, consumables_items,
  client_verification_packages
to anon, authenticated, service_role;
