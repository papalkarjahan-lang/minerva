-- ============================================================
-- MINERVA - Delta: corrective_actions (2026-09-12)
--
-- What this closes: detect-safety-hazards and verify-checklist-photos both
-- already flag real problems (a proximity hazard, a photo that doesn't
-- match its checklist item) but neither produces anything a human can
-- assign, put a due date on, or mark closed — a flag either sits in
-- safety_incidents (acknowledge-only, no owner/due-date) or just changes
-- checklist_photos.verification_status to 'flagged' with no follow-up
-- object at all. This is the gap named directly in
-- COMPETITIVE_FEATURE_ANALYSIS.md against Procore's Observations tool:
-- a real corrective-action workflow (assignee, due date, closed-at),
-- not just an alert.
--
-- One corrective_actions row per flagged thing, referencing its source by
-- (source_type, source_id) rather than two nullable foreign keys, since the
-- two source tables (safety_incidents, checklist_photos) don't share a
-- schema and this avoids a UNION-typed foreign key. Not exclusive to those
-- two — source_type is free text so a future flagging agent can create one
-- without a migration.
--
-- RLS: "anon all" — same tenant-scoping model as safety_incidents/
-- consumables_items/etc. in this schema (business_id filtering happens
-- app-side via the anon key, not per-row auth — matches every other
-- business-operational table here, as opposed to the admin_users-gated
-- pattern used for outreach_prospects/big_account_targets).
--
-- NOTE: run this once in the Supabase SQL Editor.
-- ============================================================

create table if not exists corrective_actions (
  id                        uuid primary key default gen_random_uuid(),
  business_id               uuid references businesses(id) on delete cascade,
  source_type               text not null, -- 'safety_incident' | 'checklist_photo'
  source_id                 uuid not null, -- safety_incidents.id or checklist_photos.id
  title                     text not null,
  description               text,
  assigned_to_technician_id uuid references technicians(id) on delete set null,
  status                    text not null default 'open', -- 'open' | 'in_progress' | 'closed'
  due_date                  date,
  closed_at                 timestamptz,
  notes                     text,
  created_at                timestamptz not null default now()
);

alter table corrective_actions enable row level security;

drop policy if exists "anon all corrective_actions" on corrective_actions;
create policy "anon all corrective_actions" on corrective_actions
  for all using (true) with check (true);

create index if not exists idx_corrective_actions_business on corrective_actions(business_id);
create index if not exists idx_corrective_actions_source on corrective_actions(source_type, source_id);
