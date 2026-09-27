-- ============================================================
-- MINERVA — Delta: payroll_runs (2026-09-28, compliance/records pass).
--
-- DispatcherView's Payroll tab (generatePayrollHours/exportPayrollCSV,
-- see that function's header comment) computes estimated hours per
-- technician from technician_locations entirely on-demand — nothing was
-- ever persisted, so there was no record of what was actually paid out
-- or handed to an accountant for a given period, only what the live GPS
-- data currently shows (which can drift as technician_locations rows age
-- or if a technician's history changes). This table is a frozen snapshot
-- of a run at the moment the owner clicks "Save", the record-keeping
-- counterpart to the always-fresh Generate button.
--
-- Same owner-scoped INSERT/SELECT reasoning as audit_log — this is
-- financial record data written from an already-authenticated-owner
-- DispatcherView session, not something to leave open to anon.
-- ============================================================

create table payroll_runs (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid references businesses(id) on delete cascade,
  period_start   date not null,
  period_end     date not null,
  rows           jsonb not null default '[]', -- [{ technician_id, name, hours, days_active }]
  generated_at   timestamptz default now()
);

create index idx_payroll_runs_business_generated on payroll_runs (business_id, generated_at desc);

grant select, insert on payroll_runs to anon, authenticated, service_role;

alter table payroll_runs enable row level security;

create policy "owner insert payroll_runs" on payroll_runs
  for insert with check (
    exists (select 1 from businesses b where b.id = payroll_runs.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner select payroll_runs" on payroll_runs
  for select using (
    exists (select 1 from businesses b where b.id = payroll_runs.business_id and b.owner_user_id = auth.uid())
  );
