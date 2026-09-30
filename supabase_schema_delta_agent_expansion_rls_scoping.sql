-- ============================================================
-- MINERVA — Delta: RLS scoping for technician_incidents,
-- custom_workflows, workflow_runs (2026-09-30, RLS re-audit).
--
-- WHY: supabase_schema_delta_agent_expansion.sql (2026-09-01, Track A)
-- created these three tables with `for all using (true) with check (true)`
-- — full anon SELECT/INSERT/UPDATE/DELETE, no business_id scoping at all.
-- All three are read/written directly by the anon/authenticated Supabase
-- client from DispatcherView.jsx and TechnicianView.jsx (confirmed via
-- grep — not just via an edge function using the service-role key). This
-- is a materially different, worse gap than the documented/deferred "anon
-- SELECT on unguessable-id public tracking pages" model in
-- SECURITY_NOTES.md ("Phase 2 priority: the big one") — a business_id is
-- NOT a secret (it's embedded in every one of that business's own public
-- tracking/invoice/quote links), and this was open to INSERT/UPDATE/
-- DELETE, not just SELECT. A raw REST call with the public anon key could
-- read another business's technician_incidents (dispute/near-miss/HR-
-- adjacent records), forge or delete them, forge/edit/delete another
-- business's custom_workflows (including hijacking action_target to
-- redirect a business's own webhook/email automation to an attacker's
-- endpoint), and forge workflow_runs log rows.
--
-- Same owner-scoping pattern as audit_log/payroll_runs (2026-09-28
-- deltas) and the technician-session pattern already established in
-- supabase_schema_delta_technician_auth_rls_v1.sql. Confirmed via grep
-- of DispatcherView.jsx/TechnicianView.jsx exactly which operations each
-- page performs on each table:
--   technician_incidents — owner: SELECT + INSERT (DispatcherView
--     addIncident/job details fetch). technician: INSERT only, as
--     themselves (TechnicianView submitIncident). No UPDATE/DELETE
--     anywhere in the frontend — none granted.
--   custom_workflows — owner: SELECT/INSERT/UPDATE/DELETE
--     (CustomWorkflowsPanel). No technician-side access anywhere.
--   workflow_runs — owner: SELECT only (run-log viewer). Written only by
--     run-custom-workflows via the service-role key (bypasses RLS
--     entirely) — no anon/authenticated INSERT policy needed.
--
-- Safe to run any time — `drop policy if exists` before each replacement,
-- so re-running this file is harmless. No data changes.
-- ============================================================

-- ---------- TECHNICIAN_INCIDENTS ----------
drop policy if exists "anon all technician_incidents" on technician_incidents;

create policy "owner select technician_incidents" on technician_incidents
  for select using (
    exists (select 1 from businesses b where b.id = technician_incidents.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner insert technician_incidents" on technician_incidents
  for insert with check (
    exists (select 1 from businesses b where b.id = technician_incidents.business_id and b.owner_user_id = auth.uid())
  );

create policy "technician insert own incidents" on technician_incidents
  for insert with check (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and t.id = technician_incidents.technician_id
        and t.business_id = technician_incidents.business_id
    )
  );

-- ---------- CUSTOM_WORKFLOWS ----------
drop policy if exists "anon all custom_workflows" on custom_workflows;

create policy "owner select custom_workflows" on custom_workflows
  for select using (
    exists (select 1 from businesses b where b.id = custom_workflows.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner insert custom_workflows" on custom_workflows
  for insert with check (
    exists (select 1 from businesses b where b.id = custom_workflows.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner update custom_workflows" on custom_workflows
  for update using (
    exists (select 1 from businesses b where b.id = custom_workflows.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner delete custom_workflows" on custom_workflows
  for delete using (
    exists (select 1 from businesses b where b.id = custom_workflows.business_id and b.owner_user_id = auth.uid())
  );

-- ---------- WORKFLOW_RUNS ----------
drop policy if exists "anon all workflow_runs" on workflow_runs;

create policy "owner select workflow_runs" on workflow_runs
  for select using (
    exists (select 1 from businesses b where b.id = workflow_runs.business_id and b.owner_user_id = auth.uid())
  );
-- No anon/authenticated INSERT/UPDATE/DELETE policy — the only writer is
-- run-custom-workflows, which uses the service-role key and so bypasses
-- RLS entirely. Table grants (select/insert/update/delete to anon/
-- authenticated) are left as-is from the original delta since RLS with
-- zero matching policy already blocks all anon/authenticated writes; no
-- grant change needed.
