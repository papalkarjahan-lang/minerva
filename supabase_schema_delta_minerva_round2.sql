-- ============================================================
-- MINERVA — Delta: "round 2" feature batch (2026-09-04), built after the
-- Minerva Max batch. Six more features, same honest-scoping rule as before
-- (data Minerva already has, or plumbing it already owns — no new external
-- partnerships/licences required). Run once in the Supabase SQL Editor, or
-- via the Management API. Purely additive.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Quote-to-job AI estimator
-- Own table (not reusing `leads` or `invoices`) since a quote has its own
-- lifecycle (draft -> sent -> accepted/declined) independent of both, and
-- a quote is not yet a committed job or a completed invoice.
-- ------------------------------------------------------------
create table quotes (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  lead_id       uuid references leads(id) on delete set null,
  client_name   text,
  client_phone  text,
  description   text not null,       -- the plain-English job description that was drafted from
  line_items    jsonb not null default '[]'::jsonb,
  subtotal      numeric,
  gst           numeric,
  total         numeric,
  status        text not null default 'draft', -- 'draft' | 'sent' | 'accepted' | 'declined'
  ai_drafted    boolean default false, -- false when ANTHROPIC_API_KEY was unset and the dispatcher had to price it manually
  created_at    timestamptz default now(),
  sent_at       timestamptz
);
alter table quotes enable row level security;
create policy "anon all quotes" on quotes
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- 2. Multi-technician job splitting
-- jobs.technician_id stays the single "lead" (unchanged, so existing
-- payroll/hours/GPS logic — all keyed off technician_id — is untouched).
-- This table adds optional additional crew on top of that lead.
-- ------------------------------------------------------------
create table job_assignments (
  id             uuid primary key default gen_random_uuid(),
  job_id         uuid references jobs(id) on delete cascade,
  business_id    uuid references businesses(id) on delete cascade,
  technician_id  uuid references technicians(id) on delete cascade,
  role           text default 'crew', -- free text, e.g. 'crew' | 'offsider' | 'apprentice'
  created_at     timestamptz default now(),
  unique(job_id, technician_id)
);
alter table job_assignments enable row level security;
create policy "anon all job_assignments" on job_assignments
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- 3. Customer review/reputation loop
-- ------------------------------------------------------------
alter table businesses add column google_review_link text; -- set by the business in Settings; review requests are disabled until this exists

create table review_requests (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid references businesses(id) on delete cascade,
  invoice_id   uuid references invoices(id) on delete cascade,
  client_phone text,
  sent_at      timestamptz,
  clicked_at   timestamptz,
  created_at   timestamptz default now()
);
alter table review_requests enable row level security;
create policy "anon all review_requests" on review_requests
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- 4. Seasonal demand forecasting
-- No new table — reuses the existing `agent_insights` table (already has a
-- nullable business_id column), same pattern as reconcile-billing /
-- check-credential-expiry's anomaly notes from the Agent OS build.
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 5. Emergency callout surge-pricing suggestion
-- No schema change — pure frontend suggestion using data jobs already has
-- (jobs.urgency, already added by the Fair-Rotation/Burnout Guard feature).
-- ------------------------------------------------------------

-- ------------------------------------------------------------
-- 6. Client portal "job history" page
-- Opaque token, not the raw phone number, is what appears in the URL —
-- see ClientHistoryView.jsx / TrackingView.jsx for why.
-- ------------------------------------------------------------
create table client_portal_links (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid references businesses(id) on delete cascade,
  client_phone text not null,
  token        text unique not null default gen_random_uuid()::text,
  created_at   timestamptz default now(),
  unique(business_id, client_phone)
);
alter table client_portal_links enable row level security;
create policy "anon all client_portal_links" on client_portal_links
  for all using (true) with check (true);

-- ------------------------------------------------------------
-- Grants — this project's Postgres setup does NOT auto-grant via schema-
-- level default privileges (see minerva_setup_progress.md's "Lesson for
-- future sessions" note from the 2026-09-02 outage), so every new table
-- needs an explicit grant alongside its RLS policy or it 403s despite the
-- policy being correct.
-- ------------------------------------------------------------
grant select, insert, update, delete on
  quotes, job_assignments, review_requests, client_portal_links
to anon, authenticated, service_role;
