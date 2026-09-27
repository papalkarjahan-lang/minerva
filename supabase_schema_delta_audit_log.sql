-- ============================================================
-- MINERVA — Delta: audit_log (2026-09-28, compliance/records pass).
--
-- General-purpose "who did what, when" ledger. Distinct from the other
-- compliance tables already in this schema (checklist_templates/
-- checklist_photos/corrective_actions = job-site safety records,
-- technician_credentials = licence/ticket expiry, compliance_packages =
-- per-job evidence bundles, workflow_runs = automation trigger history) —
-- none of those cover ordinary dispatcher actions like removing a
-- technician, assigning a job, or marking an invoice paid. This table is
-- the missing general record for those, written to directly from the
-- browser (same anon-insert pattern as every other table here — this app
-- has no auth.uid()-scoped RLS on writes by design) but readable only by
-- the business owner, since it's a record ABOUT staff actions, not
-- something staff need to read back.
--
-- entity_id has no FK — deliberately. An audit row must survive the
-- referenced row being deleted later (e.g. a removed technician's past
-- "assigned job" entries should still say who/what, not disappear or
-- block the delete).
-- ============================================================

create table audit_log (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  actor_type    text not null default 'owner', -- 'owner' | 'dispatcher' | 'technician' | 'system'
  actor_name    text,
  action        text not null,   -- e.g. 'technician.removed', 'job.assigned', 'invoice.paid'
  entity_type   text,            -- e.g. 'technician', 'job', 'invoice', 'checklist_template'
  entity_id     uuid,
  details       jsonb default '{}',
  created_at    timestamptz default now()
);

create index idx_audit_log_business_created on audit_log (business_id, created_at desc);

grant select, insert on audit_log to anon, authenticated, service_role;

alter table audit_log enable row level security;

-- Written from the browser with no edge function in between (same as
-- checklist_templates, invoices, etc. in this schema) so insert stays open.
create policy "anon insert audit_log" on audit_log
  for insert with check (true);

-- Read-scoped to the owning business's authenticated owner only — this is
-- the one table in this pass where "anon select" would be wrong, since the
-- whole point is a record staff can't quietly read or tamper with.
create policy "owner select audit_log" on audit_log
  for select using (
    exists (select 1 from businesses b where b.id = audit_log.business_id and b.owner_user_id = auth.uid())
  );
