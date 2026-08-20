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
  stripe_sub_item_id  text, -- the Stripe subscription *item* id (not the subscription
                             -- id) — required to call subscriptionItems.update() and
                             -- change billed quantity. Saved by stripe-webhook on
                             -- checkout.session.completed. Written by
                             -- sync-technician-billing.
  data_sharing_optin  bool default false,
  twilio_number       text, -- E.164 Twilio number for this business (e.g. +61412345678),
                             -- used by missed-call-webhook to match an inbound call's
                             -- "To" number back to a business row. Nullable: only needed
                             -- if the business has its own Twilio number configured for
                             -- voice + the missed-call-to-SMS auto-reply.
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
  completion_sms_sent bool default false, -- prevents duplicate "job complete" SMS if
                                           -- handleCompleteJob is somehow triggered twice
  notes           text,
  created_at      timestamptz default now()
);

-- Add FK from technicians.current_job_id -> jobs.id (after jobs table exists)
alter table technicians
  add constraint fk_current_job
  foreign key (current_job_id) references jobs(id) on delete set null;

-- Table 4: leads
-- Captured by the AI Intake Assistant widget (ai-intake-chat edge function)
-- when a website visitor's chat gets triaged into a qualified lead. Kept
-- separate from `jobs` because a lead is unconfirmed/unscheduled — the
-- dispatcher decides whether to convert it into a real job.
create table leads (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid references businesses(id) on delete cascade,
  client_name           text,
  client_phone          text,
  suburb                text,
  urgency               text default 'routine', -- 'emergency' | 'routine' | 'out_of_scope'
  job_description       text,
  transcript            jsonb, -- full chat history at time of capture, for context
  status                text default 'new', -- 'new' | 'contacted' | 'quoted' | 'converted' | 'lost'
  score                 int, -- 0-100 heuristic priority, set by Claude from the conversation
                              -- content (urgency + specificity) at capture time, then boosted
                              -- deterministically if is_repeat_client. NOT a trained/predictive
                              -- model (no historical conversion data exists to train one yet).
  score_reason          text, -- one-line human-readable explanation of the score
  estimated_value_tier  text, -- 'low' | 'medium' | 'high' — rough job-size signal from the
                               -- conversation, not a dollar figure or external valuation
  is_repeat_client      bool default false, -- true if this phone number already has a prior
                                             -- lead or job under the same business_id
  source                text default 'ai_intake_chat',
  created_at            timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
--
-- Minerva has no login step for business owners, technicians, or clients —
-- by design, access is via unguessable UUID links (dispatch URL, tracking
-- URL) or a technician PIN. That means every operation below runs as the
-- anon role. There is deliberately NO "authenticated" bypass policy: a
-- generic "auth.role() = authenticated" policy would grant ANY visitor who
-- self-registers a free Supabase Auth account (enabled by default on new
-- projects) full read/write access to every business's data, since nothing
-- in this schema ties an authenticated session to a specific tenant. See
-- SECURITY_NOTES.md for the full threat model and the Phase 2 recommendation
-- to add real per-owner authentication before scaling past pilot clients.
--
-- IMPORTANT Day-1 setup step: in Supabase Dashboard > Authentication >
-- Providers, disable "Allow new users to sign up". This closes off the
-- authenticated-role attack surface entirely as a belt-and-suspenders
-- measure, even though no policy below currently grants it any access.
-- ============================================================
alter table businesses enable row level security;
alter table technicians enable row level security;
alter table jobs enable row level security;
alter table leads enable row level security;

-- BUSINESSES
-- Anon can create a business at signup (no login exists at that point).
create policy "anon insert business" on businesses
  for insert with check (true);
-- Anon can read a business by its (unguessable) id — needed by the
-- dispatcher view, tracking view, and technician view.
create policy "anon select business" on businesses
  for select using (true);

-- TECHNICIANS
-- Anon can create technician rows during onboarding.
create policy "anon insert technicians" on technicians
  for insert with check (true);
-- Anon can read technician rows — needed by PIN login, the dispatcher's
-- live map, and the client tracking page. Realtime subscriptions (used for
-- the live GPS map) also require a SELECT policy to deliver change events
-- under RLS, so this cannot be narrowed to a security-definer RPC without
-- breaking live tracking. Treat all technician/tracking/dispatch links as
-- secrets — do not post them publicly or log them insecurely.
create policy "anon select technicians" on technicians
  for select using (true);
-- Anon (the technician's own phone, unauthenticated) must be able to push
-- their live GPS position and clear current_job_id on job completion.
create policy "anon update technicians" on technicians
  for update using (true);

-- JOBS
-- Dispatcher creates jobs via the "Add Job" form (anon, no login).
create policy "anon insert jobs" on jobs
  for insert with check (true);
-- Needed by dispatcher board, technician's current-job card, and the
-- public client tracking link. Same realtime constraint as technicians above.
create policy "anon select jobs" on jobs
  for select using (true);
-- Technician updates job status (start/complete) and sms_sent flag; the
-- dispatcher assigns a technician_id to a job.
create policy "anon update jobs" on jobs
  for update using (true);

-- LEADS
-- The ai-intake-chat edge function inserts a lead using the anon key once
-- the chat has captured enough info. Anon insert only — the widget runs on
-- the business's public website with no login. Anon select is needed so the
-- dispatcher board (also anon, unguessable-link model) can list new leads.
create policy "anon insert leads" on leads
  for insert with check (true);
create policy "anon select leads" on leads
  for select using (true);
create policy "anon update leads" on leads
  for update using (true);

-- ============================================================
-- ENABLE REALTIME
-- Run this after the tables are created.
-- Also toggle in Dashboard: Database > Replication > technicians
-- ============================================================
alter publication supabase_realtime add table technicians;
alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table leads;
