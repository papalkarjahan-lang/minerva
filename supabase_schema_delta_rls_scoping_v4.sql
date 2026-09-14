-- ============================================================
-- MINERVA - Delta: RLS read/write-scoping, pass 5 (2026-09-14)
--
-- CONTEXT: passes 1-4 each worked from a specific list of tables flagged
-- as "still open." This pass instead queried `pg_tables`/`pg_policies`
-- directly for every RLS-enabled table's policy shape, independent of any
-- prior list, and found 8 tables that had NEVER been mentioned in any
-- previous pass or SECURITY_NOTES.md section: `quotes`, `review_requests`,
-- `corrective_actions`, `custom_workflows`, `workflow_runs`,
-- `client_portal_links`, `compliance_packages`, `carbon_estimates`. All 8
-- still had their original single blanket `anon all ... using (true) with
-- check (true))` policy from whichever delta first created them, unscoped
-- by any pass at all — not a regression, just never audited.
--
-- Confirmed every real caller of each via grep of src/ and
-- supabase/functions/ before writing anything below:
--
-- 1. `quotes` — the ONE genuine public/anon caller is `QuoteView.jsx`
--    (unguessable quote-id link, no login): reads the quote AND updates
--    its `status` (accept/decline) — same "unguessable link is the bearer
--    token" model as `invoices`. SELECT and UPDATE stay anon `using (true)`
--    unchanged. INSERT is dropped entirely: confirmed DispatcherView's
--    "+ New quote" button calls `draft-quote` (service_role), never
--    inserts directly; `send-quote-sms` (status transitions) is also
--    service_role. DELETE was never used by anything — dropped too.
--
-- 2. `review_requests` — DispatcherView (owner) only ever SELECTs.
--    `send-review-request-sms` (insert/update/delete) and
--    `track-review-click` (select/update on click-through) are BOTH
--    service_role — the browser never touches this table for
--    insert/update/delete at all, including the "public" click-through
--    (that's a redirect the browser follows to an edge function, not a
--    direct table call from the browser's own anon key). Scoped to
--    owner-select-only.
--
-- 3. `corrective_actions` — DispatcherView (trade) and
--    IndustrialDispatcherView (industrial), both owner-authenticated via
--    RequireBusinessAuth, are the only browser callers (select/insert/
--    update). `verify-checklist-photos`/`detect-safety-hazards` insert via
--    service_role. No public reader. Scoped to owner-all.
--
-- 4. `custom_workflows` — DispatcherView (owner) only; all 4 operations
--    (create/toggle-active/delete/list). `run-custom-workflows` only reads,
--    via service_role. Scoped to owner-all.
--
-- 5. `workflow_runs` — DispatcherView (owner) SELECT only (read-only run
--    history). `run-custom-workflows` INSERTs via service_role. Scoped to
--    owner-select-only.
--
-- 6. `compliance_packages` — DispatcherView (owner) SELECT + UPDATE
--    (sent_at/sent_to, when the dispatcher marks a package as sent).
--    `generate-compliance-package` INSERTs via service_role. No public
--    reader (unlike the superficially similar `client_verification_
--    packages`/`roi_proposals`, this one is never shown to the client via
--    a link — it's an internal dispatcher record of what was sent).
--    Scoped to owner-select-and-update.
--
-- 7. `carbon_estimates` — DispatcherView (owner) SELECT only.
--    `estimate-job-carbon` INSERTs via service_role. Scoped to
--    owner-select-only.
--
-- 8. `client_portal_links` — genuinely public: `TrackingView.jsx` upserts
--    (insert-or-update, unguessable job-id page, no login) and
--    `ClientHistoryView.jsx` reads by the link's own opaque `token`.
--    Postgres upsert-on-conflict needs both INSERT and UPDATE privilege,
--    so SELECT/INSERT/UPDATE all stay anon `using (true)` — same
--    unguessable-link model as `invoices`/`quotes`. Only DELETE (never
--    used by anything) is dropped.
--
-- None of these 8 tables are touched by TechnicianView.jsx at all
-- (confirmed by grep) — no technician-side carve-out needed for any of
-- them, unlike checklist_templates/leads/etc. in pass 4.
-- ============================================================

-- QUOTES
drop policy if exists "anon all quotes" on quotes;
create policy "anon select quotes" on quotes
  for select using (true);
create policy "anon update quotes" on quotes
  for update using (true);

-- REVIEW_REQUESTS
drop policy if exists "anon all review_requests" on review_requests;
create policy "owner select review_requests" on review_requests
  for select using (
    exists (select 1 from businesses b where b.id = review_requests.business_id and b.owner_user_id = auth.uid())
  );

-- CORRECTIVE_ACTIONS
drop policy if exists "anon all corrective_actions" on corrective_actions;
create policy "owner all corrective_actions" on corrective_actions
  for all using (
    exists (select 1 from businesses b where b.id = corrective_actions.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = corrective_actions.business_id and b.owner_user_id = auth.uid())
  );

-- Separate bug found live-testing this pass, unrelated to the policy above:
-- `supabase_schema_delta_corrective_actions.sql` (2026-09-12) enabled RLS on
-- this table but never ran a base GRANT for anon/authenticated/service_role
-- at all (confirmed via information_schema.role_table_grants — zero rows
-- for this table, vs. every sibling delta like compliance_packages.sql
-- which does grant). Result: every browser request against this table,
-- pre- or post-login, has been failing with a hard Postgres "permission
-- denied for table corrective_actions" (42501) since creation — not an RLS
-- deny, a missing-grant error, so the corrective-actions feature in both
-- DispatcherView and IndustrialDispatcherView has been completely broken
-- the whole time, unrelated to anything else in this delta. Fixing here so
-- this file stays a complete, reproducible record of what was run live.
grant select, insert, update, delete on corrective_actions to anon, authenticated, service_role;

-- CUSTOM_WORKFLOWS
drop policy if exists "anon all custom_workflows" on custom_workflows;
create policy "owner all custom_workflows" on custom_workflows
  for all using (
    exists (select 1 from businesses b where b.id = custom_workflows.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = custom_workflows.business_id and b.owner_user_id = auth.uid())
  );

-- WORKFLOW_RUNS
drop policy if exists "anon all workflow_runs" on workflow_runs;
create policy "owner select workflow_runs" on workflow_runs
  for select using (
    exists (select 1 from businesses b where b.id = workflow_runs.business_id and b.owner_user_id = auth.uid())
  );

-- COMPLIANCE_PACKAGES
drop policy if exists "anon all compliance_packages" on compliance_packages;
create policy "owner select compliance_packages" on compliance_packages
  for select using (
    exists (select 1 from businesses b where b.id = compliance_packages.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner update compliance_packages" on compliance_packages
  for update using (
    exists (select 1 from businesses b where b.id = compliance_packages.business_id and b.owner_user_id = auth.uid())
  );

-- CARBON_ESTIMATES
drop policy if exists "anon all carbon_estimates" on carbon_estimates;
create policy "owner select carbon_estimates" on carbon_estimates
  for select using (
    exists (select 1 from businesses b where b.id = carbon_estimates.business_id and b.owner_user_id = auth.uid())
  );

-- CLIENT_PORTAL_LINKS
drop policy if exists "anon all client_portal_links" on client_portal_links;
create policy "anon select client_portal_links" on client_portal_links
  for select using (true);
create policy "anon insert client_portal_links" on client_portal_links
  for insert with check (true);
create policy "anon update client_portal_links" on client_portal_links
  for update using (true);
