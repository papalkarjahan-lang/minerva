-- ============================================================
-- MINERVA - Delta: outreach_prospects (2026-09-10)
--
-- What this is: Minerva's OWN sales pipeline — the businesses Minerva is
-- trying to sign up as clients (not to be confused with `industrial_leads`,
-- which is a Minerva CLIENT's own leads). This is internal-only, single-
-- operator data with no anon/public access at all — every write goes
-- through an edge function using SUPABASE_SERVICE_ROLE_KEY (same privileged
-- pattern already used by stripe-webhook/test-agent-health), and every read
-- goes through the admin console, gated the same way as `support_requests`
-- (auth.uid() must be in `admin_users` — see
-- supabase_schema_delta_rls_scoping_v1.sql for that table).
--
-- Why this exists: solves the real bottleneck of "one person can't write
-- enough personalized outreach emails per day to hit meaningful volume."
-- draft-outreach-batch (new edge function) drafts personalized emails at
-- scale using Claude; a human reviews and bulk-approves in the admin
-- console; send-outreach-batch only sends prospects already marked
-- 'approved' — the send is always a deliberate action the operator
-- triggers, never autonomous, never on a cron. This mirrors the
-- Sales & Marketing carve-out already standing in this project: nothing
-- sends unapproved outbound messages, full stop.
--
-- NOTE: run this once in the Supabase SQL Editor. Safe to re-run (uses
-- `if not exists`/`if not exists` guards throughout).
-- ============================================================

create table if not exists outreach_prospects (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  trade_type text,           -- e.g. 'plumbing', 'electrical', 'hvac', 'multi-location', 'franchise', 'industrial'
  city text,
  source text,                -- 'manual', 'named_target', 'franchise_list', 'broker_referral', etc.
  status text not null default 'new', -- new -> drafted -> approved -> sent -> replied|followup_ready -> closed_won|closed_lost
  draft_subject text,
  draft_body text,
  followup_stage int not null default 0, -- 0 = no follow-up sent yet, 1/2/3 = day 3/7/14 follow-up
  followup_subject text,
  followup_body text,
  sent_at timestamptz,
  last_followup_sent_at timestamptz,
  replied_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_outreach_prospects_status on outreach_prospects(status);

alter table outreach_prospects enable row level security;

-- Only Minerva staff (admin_users) can read/update via the admin console.
-- No anon policy exists at all — inserts and AI-drafting updates happen
-- exclusively through edge functions using the service role key, which
-- bypasses RLS by design (same as stripe-webhook writing to `businesses`).
drop policy if exists "admin select outreach_prospects" on outreach_prospects;
create policy "admin select outreach_prospects" on outreach_prospects
  for select using (exists (select 1 from admin_users a where a.user_id = auth.uid()));

drop policy if exists "admin update outreach_prospects" on outreach_prospects;
create policy "admin update outreach_prospects" on outreach_prospects
  for update using (exists (select 1 from admin_users a where a.user_id = auth.uid()));

grant select, update on outreach_prospects to authenticated;
