-- ============================================================
-- MINERVA - Missing schema pieces only (2026-08-29)
-- Your project currently has only the original 9 tables. This file
-- contains ONLY what's missing: 5 new tables, their RLS policies, 2
-- storage buckets, 10 new columns on existing tables, and 1 realtime
-- registration. It does NOT re-create businesses/technicians/jobs/etc,
-- so it will not hit the "already exists" error that rolled back your
-- last run. Run this entire block once in the Supabase SQL Editor.
-- (This does not include the AUTONOMOUS AGENTS / cron section — that's
-- still a separate step, same as before.)
-- ============================================================

-- Table 2b: technician_locations
-- Append-only GPS breadcrumb trail (route history for dispute/wage-hour
-- evidence). Written to on every GPS push, purely additive.
create table technician_locations (
  id              uuid primary key default gen_random_uuid(),
  technician_id   uuid references technicians(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  job_id          uuid references jobs(id) on delete set null,
  lat             float8 not null,
  lng             float8 not null,
  recorded_at     timestamptz not null,
  created_at      timestamptz default now()
);
create index idx_technician_locations_tech_time
  on technician_locations (technician_id, recorded_at desc);
alter table technician_locations enable row level security;
create policy "anon insert technician_locations" on technician_locations
  for insert with check (true);
create policy "anon select technician_locations" on technician_locations
  for select using (true);

-- Table 10: checklist_photos
-- Optional photo evidence attached to a checklist item on job completion.
create table checklist_photos (
  id              uuid primary key default gen_random_uuid(),
  job_id          uuid references jobs(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  checklist_item  text,
  storage_path    text not null,
  created_at      timestamptz default now()
);
alter table checklist_photos enable row level security;
create policy "anon insert checklist_photos" on checklist_photos
  for insert with check (true);
create policy "anon select checklist_photos" on checklist_photos
  for select using (true);

insert into storage.buckets (id, name, public)
values ('checklist-photos', 'checklist-photos', true)
on conflict (id) do nothing;
create policy "anon insert checklist-photos" on storage.objects
  for insert with check (bucket_id = 'checklist-photos');
create policy "anon select checklist-photos" on storage.objects
  for select using (bucket_id = 'checklist-photos');

-- Table 11: job_materials
-- Optional materials-used-per-job log, auto-decrements inventory_items.
create table job_materials (
  id                  uuid primary key default gen_random_uuid(),
  job_id              uuid references jobs(id) on delete cascade,
  business_id         uuid references businesses(id) on delete cascade,
  inventory_item_id   uuid references inventory_items(id) on delete set null,
  item_name           text not null,
  quantity_used       numeric not null,
  created_at          timestamptz default now()
);
alter table job_materials enable row level security;
create policy "anon insert job_materials" on job_materials
  for insert with check (true);
create policy "anon select job_materials" on job_materials
  for select using (true);

-- Table 12: technician_credentials
-- Licence/ticket/certification tracking with expiry-warning throttles.
create table technician_credentials (
  id                    uuid primary key default gen_random_uuid(),
  technician_id         uuid references technicians(id) on delete cascade,
  business_id           uuid references businesses(id) on delete cascade,
  credential_type       text,
  credential_name       text not null,
  expiry_date           date not null,
  document_storage_path text,
  warning_30_sent_at    timestamptz,
  warning_14_sent_at    timestamptz,
  warning_7_sent_at     timestamptz,
  created_at            timestamptz default now()
);
alter table technician_credentials enable row level security;
create policy "anon insert technician_credentials" on technician_credentials
  for insert with check (true);
create policy "anon select technician_credentials" on technician_credentials
  for select using (true);
create policy "anon update technician_credentials" on technician_credentials
  for update using (true);
create policy "anon delete technician_credentials" on technician_credentials
  for delete using (true);

insert into storage.buckets (id, name, public)
values ('credential-documents', 'credential-documents', true)
on conflict (id) do nothing;
create policy "anon insert credential-documents" on storage.objects
  for insert with check (bucket_id = 'credential-documents');
create policy "anon select credential-documents" on storage.objects
  for select using (bucket_id = 'credential-documents');

-- New columns: Wasted-Trip / No-Show Proof Agent
alter table jobs add column no_show_detected_at timestamptz;
alter table jobs add column no_show_reschedule_sms_sent_at timestamptz;

-- New columns: Weather-Risk Reschedule Agent
alter table businesses add column weather_sensitive_trade_types text[];
alter table jobs add column weather_risk_flagged_at timestamptz;

-- Table 13: weather_reschedule_drafts
-- Human-approval-gated, same pattern as marketing_drafts.
create table weather_reschedule_drafts (
  id                uuid primary key default gen_random_uuid(),
  job_id            uuid references jobs(id) on delete cascade,
  business_id       uuid references businesses(id) on delete cascade,
  forecast_summary  text,
  status            text not null default 'pending',
  created_at        timestamptz default now(),
  reviewed_at       timestamptz
);
alter table weather_reschedule_drafts enable row level security;
create policy "anon insert weather_reschedule_drafts" on weather_reschedule_drafts
  for insert with check (true);
create policy "anon select weather_reschedule_drafts" on weather_reschedule_drafts
  for select using (true);
create policy "anon update weather_reschedule_drafts" on weather_reschedule_drafts
  for update using (true);

-- New columns: Paid-Invoice Referral Loop
alter table invoices add column referral_code text;
alter table leads add column referred_by_code text;

-- New columns: Fair-Rotation / Burnout Guard
alter table jobs add column urgency text;
alter table technicians add column rolling_emergency_job_count int default 0;
alter table technicians add column rolling_week_hours numeric default 0;
alter table technicians add column burnout_flag_sent_at timestamptz;

-- Realtime: weather_reschedule_drafts is a live pending-approval queue.
alter publication supabase_realtime add table weather_reschedule_drafts;
