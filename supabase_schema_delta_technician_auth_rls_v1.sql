-- ============================================================
-- MINERVA — Delta: real technician authentication, part 2 of 2
-- (2026-09-14, RLS write-scoping unlocked by
-- supabase_schema_delta_technician_auth_v1.sql + the new
-- `technician-login` edge function.)
--
-- Every table below has always had `anon ... using (true)` / `with check
-- (true)` policies for INSERT/UPDATE, because the technician side of each
-- one had no `auth.uid()` at all — just a PIN check with no session.
-- Practical effect: literally anyone with devtools open (the anon key is
-- extractable from any browser's JS bundle) could, without ever having a
-- real PIN, edit any job, move any technician's GPS pin, deactivate any
-- technician platform-wide, forge checklist photos/materials/invoices for
-- jobs that were never theirs, or drain arbitrary inventory — not just for
-- one business, for ALL of them. That's the gap this closes.
--
-- SELECT is DELIBERATELY LEFT ALONE almost everywhere in this delta (see
-- SECURITY_NOTES.md's "unguessable link" model) — confirmed by grep of
-- TrackingView.jsx, DisputeView.jsx, and InvoiceView.jsx (the three public,
-- no-login client-facing pages) exactly which tables each one reads by a
-- bare unguessable id with no auth. Narrowing SELECT on any of those would
-- break a real public feature, not just tighten a gap. Two tables
-- (`job_assignments`, `technician_credentials`) and one (`inventory_items`)
-- are confirmed NOT read by any of those three public pages, so their
-- SELECT is scoped down too — the only genuine reads left of theirs are
-- the owner-authed dispatcher and the technician's own real auth session.
--
-- Ownership check used throughout for "the business's owner":
--   exists (select 1 from businesses b where b.id = <business_id col> and b.owner_user_id = auth.uid())
-- Ownership check used throughout for "this technician, authenticated":
--   exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.id = <technician_id col>)
--
-- Safe to run once. `drop policy if exists` before each replacement, so
-- re-running this file is harmless.
-- ============================================================

-- ---------- TECHNICIANS ----------
-- INSERT: only the business owner adds technicians (DispatcherView "Add
-- technician" form, utils.js addTechnicianRows). No technician-side insert
-- exists anywhere in the code.
drop policy if exists "anon insert technicians" on technicians;
create policy "owner insert technicians" on technicians
  for insert with check (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );

-- UPDATE: the technician's own phone (GPS push, current_job_id clear on
-- job completion/leaving a job, onboarding_completed_at) OR the owner
-- (assign current_job_id, deactivate via is_active).
drop policy if exists "anon update technicians" on technicians;
create policy "owner update technicians" on technicians
  for update using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
create policy "technician update own row" on technicians
  for update using (auth_user_id = auth.uid());

-- SELECT stays anon `using (true)` — read by TrackingView.jsx and
-- DisputeView.jsx (public links, by technician id), plus the dispatcher's
-- live map and PIN login. Confirmed above, not touched here.

-- ---------- JOBS ----------
-- INSERT: only the owner creates jobs (DispatcherView "Add Job").
drop policy if exists "anon insert jobs" on jobs;
create policy "owner insert jobs" on jobs
  for insert with check (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );

-- UPDATE: the owner (assign technician_id, reassign, edit) OR the
-- technician actually on this job — either as the assigned lead
-- (jobs.technician_id) or as crew (job_assignments row) — updating status/
-- notes/sms_sent on their own job.
drop policy if exists "anon update jobs" on jobs;
create policy "owner update jobs" on jobs
  for update using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
create policy "technician update own job" on jobs
  for update using (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and (
          t.id = jobs.technician_id
          or exists (select 1 from job_assignments ja where ja.job_id = jobs.id and ja.technician_id = t.id)
        )
    )
  );

-- SELECT stays anon `using (true)` — read by TrackingView.jsx/DisputeView.jsx
-- (public tracking/dispute links, by job id) and realtime.

-- ---------- TECHNICIAN_LOCATIONS ----------
-- INSERT: only the technician whose breadcrumb it is. Never edited/deleted
-- by anyone (history is append-only by design — an editable trail isn't
-- evidence, per the original schema comment).
drop policy if exists "anon insert technician_locations" on technician_locations;
create policy "technician insert own location" on technician_locations
  for insert with check (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.id = technician_id)
  );
-- SELECT stays anon `using (true)` — dispatcher's "view route" trail and
-- DisputeView.jsx both read it by job/technician id.

-- ---------- INVOICES ----------
-- INSERT: only the technician on the job it's for (job completion flow).
-- No dispatcher-side insert exists anywhere in the code.
drop policy if exists "anon insert invoices" on invoices;
create policy "technician insert invoice for own job" on invoices
  for insert with check (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and (
          exists (select 1 from jobs j where j.id = job_id and j.technician_id = t.id)
          or exists (select 1 from job_assignments ja where ja.job_id = job_id and ja.technician_id = t.id)
        )
    )
  );
-- UPDATE: only the owner marks paid/void (DispatcherView). No
-- technician-side update exists.
drop policy if exists "anon update invoices" on invoices;
create policy "owner update invoices" on invoices
  for update using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
-- SELECT stays anon `using (true)` — InvoiceView.jsx (public payment link)
-- and DisputeView.jsx both read by invoice/job id.

-- ---------- CHECKLIST_PHOTOS ----------
-- INSERT: only the technician on the job it's for.
drop policy if exists "anon insert checklist_photos" on checklist_photos;
create policy "technician insert checklist_photo for own job" on checklist_photos
  for insert with check (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and (
          exists (select 1 from jobs j where j.id = job_id and j.technician_id = t.id)
          or exists (select 1 from job_assignments ja where ja.job_id = job_id and ja.technician_id = t.id)
        )
    )
  );
-- UPDATE: dropped entirely — this was only ever written by
-- verify-checklist-photos, which moved to service_role this session
-- (bypasses RLS) and no longer needs an anon policy at all. No
-- browser-side update of this table exists anywhere in the code.
drop policy if exists "anon update checklist_photos" on checklist_photos;
-- SELECT stays anon `using (true)` — DisputeView.jsx reads by job id.

-- ---------- JOB_MATERIALS ----------
-- INSERT: only the technician on the job it's for.
drop policy if exists "anon insert job_materials" on job_materials;
create policy "technician insert job_material for own job" on job_materials
  for insert with check (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and (
          exists (select 1 from jobs j where j.id = job_id and j.technician_id = t.id)
          or exists (select 1 from job_assignments ja where ja.job_id = job_id and ja.technician_id = t.id)
        )
    )
  );
-- SELECT stays anon `using (true)` — DisputeView.jsx reads by job id.

-- ---------- TECHNICIAN_CREDENTIALS ----------
-- Not read by any public page (confirmed: absent from TrackingView.jsx/
-- DisputeView.jsx/InvoiceView.jsx) — only the owner-authed dispatcher and
-- the technician's own expiring-soon banner read it. Safe to scope SELECT
-- too, not just writes.
drop policy if exists "anon select technician_credentials" on technician_credentials;
create policy "owner select technician_credentials" on technician_credentials
  for select using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
create policy "technician select own credentials" on technician_credentials
  for select using (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.id = technician_id)
  );
-- INSERT: only the owner adds a credential (DispatcherView).
drop policy if exists "anon insert technician_credentials" on technician_credentials;
create policy "owner insert technician_credentials" on technician_credentials
  for insert with check (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
-- UPDATE/DELETE: dropped entirely — only ever written by
-- check-credential-expiry, which is service_role now (bypasses RLS). No
-- browser-side update/delete of this table exists anywhere in the code.
drop policy if exists "anon update technician_credentials" on technician_credentials;
drop policy if exists "anon delete technician_credentials" on technician_credentials;

-- ---------- TECHNICIAN_INCIDENTS ----------
-- (SELECT was already scoped to the owner in pass 1 — see
-- supabase_schema_delta_rls_scoping_v1.sql. This just finishes the job on
-- INSERT/UPDATE/DELETE, which pass 1 explicitly left as anon because no
-- technician auth.uid() existed yet.)
drop policy if exists "anon insert technician_incidents" on technician_incidents;
create policy "technician insert own incident" on technician_incidents
  for insert with check (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.id = technician_id)
  );
-- UPDATE/DELETE: dropped entirely — nothing in the browser code ever
-- updates or deletes an incident row (write-once safety log by design).
drop policy if exists "anon update technician_incidents" on technician_incidents;
drop policy if exists "anon delete technician_incidents" on technician_incidents;

-- ---------- JOB_ASSIGNMENTS (crew members) ----------
-- Not read by any public page (confirmed absent from TrackingView.jsx/
-- DisputeView.jsx/InvoiceView.jsx) — safe to scope SELECT too.
drop policy if exists "anon all job_assignments" on job_assignments;
create policy "owner all job_assignments" on job_assignments
  for all using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
create policy "technician select own assignments" on job_assignments
  for select using (
    exists (
      select 1 from technicians t
      where t.auth_user_id = auth.uid()
        and (
          t.id = job_assignments.technician_id
          or exists (select 1 from jobs j where j.id = job_assignments.job_id and j.technician_id = t.id)
        )
    )
  );
create policy "technician delete own assignment" on job_assignments
  for delete using (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.id = technician_id)
  );

-- ---------- INVENTORY_ITEMS ----------
-- Not read by any public page — safe to scope SELECT too. Both the owner
-- and any technician in the business need to see/decrement stock levels
-- (materials-used picker), so technician access here is business-wide,
-- not job-scoped like the tables above.
drop policy if exists "anon select inventory_items" on inventory_items;
create policy "owner select inventory_items" on inventory_items
  for select using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
create policy "technician select business inventory" on inventory_items
  for select using (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = inventory_items.business_id)
  );
-- INSERT: only the owner adds new inventory items (DispatcherView).
drop policy if exists "anon insert inventory_items" on inventory_items;
create policy "owner insert inventory_items" on inventory_items
  for insert with check (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
-- UPDATE: both the owner (manual quantity edit) and any technician in the
-- business (decrement on materials-used) need this.
drop policy if exists "anon update inventory_items" on inventory_items;
create policy "owner update inventory_items" on inventory_items
  for update using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
create policy "technician update business inventory" on inventory_items
  for update using (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = inventory_items.business_id)
  );
-- DELETE: owner only — no browser-side delete found anywhere, but keeping
-- this scoped rather than dropped in case it's used via an untested UI path.
drop policy if exists "anon delete inventory_items" on inventory_items;
create policy "owner delete inventory_items" on inventory_items
  for delete using (
    exists (select 1 from businesses b where b.id = business_id and b.owner_user_id = auth.uid())
  );
