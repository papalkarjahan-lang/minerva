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
-- the missing general record for those.
--
-- Unlike most tables in the original schema (anon-insert-with-check(true)),
-- every current writer of audit_log is DispatcherView, which already runs
-- in an authenticated-owner session (supabase.auth.getSession(), same as
-- the owner_user_id-scoped tables from the rls_scoping_v1-v4 deltas). So
-- both INSERT and SELECT are owner-scoped here, not just SELECT — an audit
-- trail an anon caller could forge rows into (even unreadable ones) isn't
-- a trustworthy trail. If a technician-side write path is ever added,
-- that will need its own policy added then, not a wider "anon insert" now.
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

create policy "owner insert audit_log" on audit_log
  for insert with check (
    exists (select 1 from businesses b where b.id = audit_log.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner select audit_log" on audit_log
  for select using (
    exists (select 1 from businesses b where b.id = audit_log.business_id and b.owner_user_id = auth.uid())
  );
