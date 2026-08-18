-- ============================================================
-- MINERVA - Complete Supabase Schema
-- Run this entire block in the Supabase SQL Editor
-- ============================================================

-- Table 1: businesses
create table businesses (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  trade_type          text,
  city                text,
  contact_email       text,
  contact_phone       text,
  subscription_tier   text default 'standard',
  stripe_customer_id  text,
  stripe_sub_id       text,
  data_sharing_optin  bool default false,
  created_at          timestamptz default now()
);

-- Table 2: technicians
create table technicians (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  name            text not null,
  phone           text,
  pin             text,
  current_lat     float8,
  current_lng     float8,
  last_seen       timestamptz,
  current_job_id  uuid,
  is_active       bool default true,
  created_at      timestamptz default now()
);

-- Table 3: jobs
create table jobs (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  technician_id   uuid references technicians(id) on delete set null,
  client_name     text,
  client_phone    text,
  client_address  text,
  client_lat      float8,
  client_lng      float8,
  status          text default 'scheduled',
  scheduled_time  timestamptz,
  started_at      timestamptz,
  completed_at    timestamptz,
  sms_sent        bool default false,
  notes           text,
  created_at      timestamptz default now()
);

-- Add FK from technicians.current_job_id -> jobs.id (after jobs table exists)
alter table technicians
  add constraint fk_current_job
  foreign key (current_job_id) references jobs(id) on delete set null;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table businesses enable row level security;
alter table technicians enable row level security;
alter table jobs enable row level security;

create policy "Auth users full access" on businesses
  for all using (auth.role() = 'authenticated');

create policy "Auth users full access" on technicians
  for all using (auth.role() = 'authenticated');

create policy "Auth users full access" on jobs
  for all using (auth.role() = 'authenticated');

-- Anon read for tracking links (client tracking page reads a single job + tech)
create policy "Anon can read single job for tracking" on jobs
  for select using (true);

create policy "Anon can read technician position for tracking" on technicians
  for select using (true);

-- ============================================================
-- ENABLE REALTIME
-- Run this after the tables are created.
-- Also toggle in Dashboard: Database > Replication > technicians
-- ============================================================
alter publication supabase_realtime add table technicians;
alter publication supabase_realtime add table jobs;
