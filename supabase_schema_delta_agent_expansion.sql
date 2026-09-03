-- ============================================================
-- MINERVA - Delta: Agent Expansion Pack (Track A, 2026-09-01)
-- Adds the pieces of the "named agent departments" redesign that apply
-- directly to the existing AU trade-business focus (no new industry/sector).
-- Standalone — only touches NEW tables/columns, won't hit "already exists"
-- (see supabase_schema_missing.sql for why that matters).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this enables:
--  1. Watchtower / Verification Layer — AI review of checklist photos
--     against the checklist item they claim to satisfy, for accountability
--     (dispute protection) rather than just "a photo was attached".
--  2. Crew Coordination accountability log — technician_incidents records
--     disputes, notable on-site events, and manual notes tied to a job/tech,
--     independent of the pass/fail checklist itself.
--  3. Front Desk / Finance "lost lead" duty — leads marked 'lost' get one
--     autonomous re-engagement text after a cooldown, mirroring the
--     existing nurture-stale-leads pattern (see winback-lost-leads fn).
--  4. General-purpose "customized via chat" agent — custom_workflows lets a
--     business define simple trigger -> condition -> action rules (e.g.
--     "when a job is marked complete in Plumbing, POST to this webhook")
--     without needing a new edge function per business. workflow_runs logs
--     every execution for visibility/debugging.
-- ============================================================

-- Watchtower: AI photo verification against the checklist item text.
alter table checklist_photos add column verification_status text default 'pending';
  -- 'pending' | 'pass' | 'flagged' | 'unavailable' (unavailable = ran with no
  -- ANTHROPIC_API_KEY configured, treated as informational-only, never blocks
  -- the technician's own checklist completion).
alter table checklist_photos add column verification_notes text;
  -- one-line reasoning from the AI review, shown to the dispatcher on hover.

-- Crew Coordination: accountability / dispute log, independent of the
-- checklist pass/fail itself — for disputes, near-misses, or any notable
-- on-site event a dispatcher or technician wants on record.
create table technician_incidents (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  technician_id   uuid references technicians(id) on delete set null,
  job_id          uuid references jobs(id) on delete set null,
  category        text default 'note', -- 'dispute' | 'near_miss' | 'note' | 'commendation'
  description     text not null,
  reported_by     text, -- free text: 'dispatcher' | 'technician' | 'client' | a name
  created_at      timestamptz default now()
);
alter table technician_incidents enable row level security;
create policy "anon all technician_incidents" on technician_incidents
  for all using (true) with check (true);

-- Front Desk / Finance: lost-lead win-back tracking.
alter table leads add column lost_winback_sent_at timestamptz;

-- Setup-stage personalization: which departments/features this specific
-- business said matter most to them, captured once during Onboarding.
-- Purely informational today (shown back to the business, e.g. in the
-- dispatcher header) — not a feature-flag/permission gate, so leaving it
-- unset never hides or breaks anything.
alter table businesses add column feature_priorities text[];

-- General-purpose workflow agent: chat-configured automation rules.
create table custom_workflows (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  name            text not null,
  trigger_event   text not null, -- 'lead.created' | 'job.completed' | 'invoice.paid' | 'invoice.overdue'
  condition_field text, -- optional, e.g. 'urgency', 'estimated_value_tier', 'total'
  condition_op    text, -- 'eq' | 'neq' | 'gt' | 'lt' | 'contains' — null/empty = always match
  condition_value text,
  action_type     text not null, -- 'webhook' | 'slack'
  action_target   text not null, -- webhook URL, or ignored for 'slack' (uses business's own slack_webhook_url)
  active          bool default true,
  created_at      timestamptz default now()
);
alter table custom_workflows enable row level security;
create policy "anon all custom_workflows" on custom_workflows
  for all using (true) with check (true);

create table workflow_runs (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     uuid references custom_workflows(id) on delete cascade,
  business_id     uuid references businesses(id) on delete cascade,
  trigger_event   text,
  status          text, -- 'sent' | 'failed' | 'skipped_no_match'
  detail          text,
  created_at      timestamptz default now()
);
alter table workflow_runs enable row level security;
create policy "anon all workflow_runs" on workflow_runs
  for all using (true) with check (true);

-- Table-level grants — RLS policies above are inert without these (see the
-- 2026-09-02 outage note in supabase_schema.sql's ROW LEVEL SECURITY
-- section for the full story of why this line can't be skipped).
grant select, insert, update, delete on
  technician_incidents, custom_workflows, workflow_runs
to anon, authenticated, service_role;
