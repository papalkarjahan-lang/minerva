-- ============================================================
-- MINERVA - Delta: RLS read/write-scoping, pass 3 (2026-09-14)
--
-- CONTEXT: pass 1 (rls_scoping_v1) and pass 2 (rls_scoping_v2) each closed
-- what they could at the time, but both explicitly deferred `leads`,
-- `checklist_templates`, `businesses`, and all `industrial_*` tables
-- because technicians had no real Supabase Auth session yet (PIN-only,
-- no auth.uid()) — scoping those tables to auth.uid() would have broken
-- the technician app outright.
--
-- That blocker is now gone: supabase_schema_delta_technician_auth_v1.sql +
-- technician-login (same day) gives every technician a real auth.uid()
-- behind their PIN, with zero UX change. This delta uses that to close
-- four more gaps, confirmed via a fresh grep of every `.from()` call site
-- in src/ and supabase/functions/ (not assumed):
--
-- 1. `checklist_templates` — SELECT was anon `using (true)`. The only
--    browser readers are DispatcherView (owner) and TechnicianView (now
--    authenticated). INSERT/UPDATE are owner-only (DispatcherView's
--    checklist setup). Scoped to owner-or-technician(business-scoped) for
--    SELECT, owner-only for INSERT/UPDATE.
--
-- 2. `leads` — SELECT/UPDATE were anon `using (true)`. The only browser
--    reader/writer is DispatcherView (owner). INSERT stays anon: it's the
--    ONLY genuinely public writer (TrackingView.jsx's client rebooking
--    flow, unguessable job-id link, no login) — narrowing it would break
--    a real shipped feature, same reasoning as invoices/checklist_photos
--    in the technician-auth delta.
--
-- 3. `businesses` — UPDATE was anon `using (true)` (added in
--    businesses_update_policy.sql to unblock three owner/admin features
--    that all silently no-op'd otherwise). Confirmed via grep of every
--    `.from('businesses').update(...)` call in src/: all three
--    browser-side writers are Supabase-Auth-authenticated already —
--    RequireBusinessAuth.jsx's owner_user_id auto-claim (first login,
--    matches on contact_email since owner_user_id is still null),
--    DispatcherView.jsx's Minerva Max addon toggles (owner, after claim),
--    and AdminConsole.jsx's tier override (admin, email-allowlist gated at
--    the app layer only, same table pattern as agent_functions/
--    agent_insights in pass 2). Every edge function that writes
--    `businesses` already uses service_role. Scoped to: owner_user_id =
--    auth.uid(), OR the one-time claim (owner_user_id still null AND
--    contact_email matches the logged-in user's JWT email), OR admin_users
--    membership. SELECT/INSERT deliberately NOT touched — see below.
--
-- 4. All 8 `industrial_*` tables (industrial_assets, asset_telemetry_events,
--    industrial_leads, site_projects, site_checkins, safety_incidents,
--    consumables_items, client_verification_packages) — each had a single
--    blanket `anon all ... using (true) with check (true))` policy.
--    Confirmed via grep: the ONLY browser reader/writer of any of these 8
--    tables is IndustrialDispatcherView.jsx, which is wrapped by
--    RequireBusinessAuth.jsx (owner-authenticated) exactly like
--    DispatcherView. monitor-asset-telemetry and harvest-industrial-leads
--    (the two real external ingestion endpoints) already use service_role
--    + a shared X-Ingestion-Key header check, not RLS, so they're
--    unaffected. Every other industrial_* writer (package-client-
--    verification, detect-idle-assets, verify-industrial-compliance,
--    detect-safety-hazards, enrich-industrial-leads, industrial-conductor,
--    predict-asset-maintenance, sequence-handoffs, track-consumables,
--    optimize-industrial-routes) is already service_role. All 8 tables
--    have their own business_id column, so all 8 get the same owner-only
--    `for all` policy, replacing the anon blanket one entirely — no public
--    page reads any of these by unguessable link today.
--
-- Deliberately NOT touched by this pass (genuine public/anon readers or
-- writers, confirmed by grep, same "unguessable link" model documented in
-- SECURITY_NOTES.md):
--   - `businesses` SELECT/INSERT — IntakeAssistant.jsx and SuccessPage.jsx
--     read a business by its unguessable id with no login; Onboarding.jsx
--     inserts a new business at signup, before any login exists. Both stay
--     anon `using/with check (true)`.
--   - `leads` INSERT — TrackingView.jsx's rebooking flow (see above).
--   - `jobs`, `technicians`, `technician_locations`, `invoices`,
--     `checklist_photos`, `job_materials` SELECT — already covered by
--     technician_auth_rls_v1's header, still accurate, not repeated here.
--   - `roi_proposals` — checked live: it only ever had a SELECT policy
--     (anon, unguessable link, no writer at all from the browser — all
--     writes are generate-roi-proposal, service_role). Nothing to change.
-- ============================================================

-- CHECKLIST_TEMPLATES
drop policy if exists "anon select checklist_templates" on checklist_templates;
drop policy if exists "anon insert checklist_templates" on checklist_templates;
drop policy if exists "anon update checklist_templates" on checklist_templates;

create policy "owner or technician select checklist_templates" on checklist_templates
  for select using (
    exists (select 1 from businesses b where b.id = checklist_templates.business_id and b.owner_user_id = auth.uid())
    or exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = checklist_templates.business_id)
  );

create policy "owner insert checklist_templates" on checklist_templates
  for insert with check (
    exists (select 1 from businesses b where b.id = checklist_templates.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner update checklist_templates" on checklist_templates
  for update using (
    exists (select 1 from businesses b where b.id = checklist_templates.business_id and b.owner_user_id = auth.uid())
  );

-- LEADS
drop policy if exists "anon select leads" on leads;
drop policy if exists "anon update leads" on leads;
-- "anon insert leads" intentionally left in place — see header.

create policy "owner select leads" on leads
  for select using (
    exists (select 1 from businesses b where b.id = leads.business_id and b.owner_user_id = auth.uid())
  );

create policy "owner update leads" on leads
  for update using (
    exists (select 1 from businesses b where b.id = leads.business_id and b.owner_user_id = auth.uid())
  );

-- BUSINESSES
--
-- NOTE: the new UPDATE policy below checks admin_users via EXISTS. Pass 1
-- (rls_scoping_v1) only ever granted SELECT on admin_users to
-- `authenticated`, because every table that referenced it until now
-- (agent_functions, agent_insights, agent_council_reports,
-- outreach_engine, big_account_targets) was already fully gated to
-- authenticated-only — the `anon` role never touched that EXISTS branch.
-- `businesses` still needs an `anon` UPDATE policy (a logged-out request
-- using the bare anon key must still get a clean RLS "no match", not an
-- error), so `anon` also needs the grant — confirmed safe: admin_users'
-- OWN row-level policy is `auth.uid() = user_id`, so a plain anon request
-- (auth.uid() is null) still returns zero rows either way. This just
-- avoids a `permission denied for table admin_users` Postgres error where
-- a clean RLS deny was intended, caught by live-testing this delta itself.
grant select on admin_users to anon;

drop policy if exists "anon update business" on businesses;
-- "anon insert business" and "anon select business" intentionally left in
-- place — see header.

create policy "owner or admin update business" on businesses
  for update using (
    owner_user_id = auth.uid()
    or (owner_user_id is null and contact_email is not null and lower(contact_email) = lower(auth.jwt() ->> 'email'))
    or exists (select 1 from admin_users a where a.user_id = auth.uid())
  )
  with check (
    owner_user_id = auth.uid()
    or (owner_user_id is null and contact_email is not null and lower(contact_email) = lower(auth.jwt() ->> 'email'))
    or exists (select 1 from admin_users a where a.user_id = auth.uid())
  );

-- INDUSTRIAL_* (all 8 tables, same owner-only pattern)
drop policy if exists "anon all industrial_assets" on industrial_assets;
create policy "owner all industrial_assets" on industrial_assets
  for all using (
    exists (select 1 from businesses b where b.id = industrial_assets.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = industrial_assets.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "anon all asset_telemetry_events" on asset_telemetry_events;
create policy "owner all asset_telemetry_events" on asset_telemetry_events
  for all using (
    exists (select 1 from businesses b where b.id = asset_telemetry_events.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = asset_telemetry_events.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "anon all industrial_leads" on industrial_leads;
create policy "owner all industrial_leads" on industrial_leads
  for all using (
    exists (select 1 from businesses b where b.id = industrial_leads.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = industrial_leads.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "anon all site_projects" on site_projects;
create policy "owner all site_projects" on site_projects
  for all using (
    exists (select 1 from businesses b where b.id = site_projects.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = site_projects.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "anon all site_checkins" on site_checkins;
create policy "owner all site_checkins" on site_checkins
  for all using (
    exists (select 1 from businesses b where b.id = site_checkins.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = site_checkins.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "anon all safety_incidents" on safety_incidents;
create policy "owner all safety_incidents" on safety_incidents
  for all using (
    exists (select 1 from businesses b where b.id = safety_incidents.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = safety_incidents.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "anon all consumables_items" on consumables_items;
create policy "owner all consumables_items" on consumables_items
  for all using (
    exists (select 1 from businesses b where b.id = consumables_items.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = consumables_items.business_id and b.owner_user_id = auth.uid())
  );

drop policy if exists "anon all client_verification_packages" on client_verification_packages;
create policy "owner all client_verification_packages" on client_verification_packages
  for all using (
    exists (select 1 from businesses b where b.id = client_verification_packages.business_id and b.owner_user_id = auth.uid())
  ) with check (
    exists (select 1 from businesses b where b.id = client_verification_packages.business_id and b.owner_user_id = auth.uid())
  );
