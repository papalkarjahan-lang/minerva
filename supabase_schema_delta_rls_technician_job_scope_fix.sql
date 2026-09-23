-- ============================================================
-- MINERVA — Fix: technician INSERT policies on invoices,
-- checklist_photos, job_materials were accidentally tautological
-- (2026-09-23, Round 38 RLS audit).
--
-- Root cause: supabase_schema_delta_technician_auth_rls_v1.sql wrote
-- the job_assignments fallback branch as:
--
--     exists (select 1 from job_assignments ja
--              where ja.job_id = job_id and ja.technician_id = t.id)
--
-- The unqualified `job_id` does NOT bind to the row being inserted
-- (invoices.job_id / checklist_photos.job_id / job_materials.job_id)
-- as intended. Because job_assignments itself has a column named
-- job_id, Postgres resolves the unqualified reference to the nearest
-- matching column — the subquery's own `ja.job_id` — so the clause
-- compiles to `ja.job_id = ja.job_id`, a tautology that's always true
-- for ANY row in job_assignments. Confirmed live via
-- pg_get_expr(polwithcheck, polrelid), which decompiled the deployed
-- policy exactly this way.
--
-- Real-world effect: any technician with at least one row anywhere
-- in job_assignments (i.e. any technician who has ever been assigned
-- to any job) could INSERT a checklist_photos / invoices /
-- job_materials row tagged with ANY job_id — not just jobs actually
-- assigned to them. This is a cross-job data-injection gap, not just
-- a theoretical one: RLS is the only scoping mechanism on these
-- anon-role INSERT paths.
--
-- Fix: qualify the outer reference explicitly against the target
-- table so it can never be shadowed by an identically-named inner
-- column. Everything else about each policy (the `jobs j` direct-
-- assignment branch, which was already correct) is unchanged.
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

drop policy if exists "technician insert invoice for own job" on invoices;
create policy "technician insert invoice for own job" on invoices
  for insert with check (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and (
          exists (select 1 from jobs j where j.id = invoices.job_id and j.technician_id = t.id)
          or exists (select 1 from job_assignments ja where ja.job_id = invoices.job_id and ja.technician_id = t.id)
        )
    )
  );

drop policy if exists "technician insert checklist_photo for own job" on checklist_photos;
create policy "technician insert checklist_photo for own job" on checklist_photos
  for insert with check (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and (
          exists (select 1 from jobs j where j.id = checklist_photos.job_id and j.technician_id = t.id)
          or exists (select 1 from job_assignments ja where ja.job_id = checklist_photos.job_id and ja.technician_id = t.id)
        )
    )
  );

drop policy if exists "technician insert job_material for own job" on job_materials;
create policy "technician insert job_material for own job" on job_materials
  for insert with check (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and (
          exists (select 1 from jobs j where j.id = job_materials.job_id and j.technician_id = t.id)
          or exists (select 1 from job_assignments ja where ja.job_id = job_materials.job_id and ja.technician_id = t.id)
        )
    )
  );
