-- ============================================================
-- MINERVA - Delta: RLS read/write-scoping, pass 2 (2026-09-14)
--
-- CONTEXT: pass 1 (supabase_schema_delta_rls_scoping_v1.sql, 2026-09-05)
-- scoped SELECT on a handful of tables confirmed to have zero anonymous
-- technician/public reader, and explicitly deferred the rest because ~52
-- background edge functions ran on the `anon` key and needed cross-
-- business reads by design (see that file's header + SECURITY_NOTES.md
-- "Phase 2 priority" section for the full reasoning).
--
-- That blocker is now gone: all 52 of those edge functions have been
-- migrated from SUPABASE_ANON_KEY to SUPABASE_SERVICE_ROLE_KEY (server-
-- side only, never exposed to a browser — service_role bypasses RLS
-- entirely by design, same as any trusted backend). None of them relied
-- on RLS to restrict their own behavior (they were already fully-trusted
-- code performing intentional cross-business operations against
-- previously-wide-open `using (true)` policies), so this changes nothing
-- observable about what they do — it only removes their dependency on
-- permissive RLS, which is what unlocks tightening it here.
--
-- Two real, distinct gaps closed by this pass:
--
-- 1. `agent_functions` / `agent_insights` / `agent_council_reports` are
--    Minerva's OWN platform-wide operator data (agent_functions has no
--    business_id column at all — one row per function name, globally).
--    Before this delta, ANY anon-key holder (i.e. anyone who opened
--    devtools on the live site) could read every function's health
--    status and cross-business insights, AND flip any function's
--    `enabled` kill-switch off for the entire platform, not just one
--    business. The DispatcherView "Agent Ops" tab was already UX-gated
--    behind `?agents=1` and its own code comment already said "Not a
--    security boundary" — this delta makes it one, by requiring the
--    caller to be a real logged-in Supabase Auth user present in
--    `admin_users` (the staff table created in pass 1, still empty until
--    an operator logs in via /login and is added manually — see pass 1's
--    header for the exact insert). SELECT + UPDATE now require admin;
--    INSERT/DELETE are no longer needed by any anon caller (only the
--    now-service_role functions and the RPC `record_agent_run` write
--    these, both of which bypass RLS) so those anon policies are dropped
--    entirely rather than re-scoped.
--
-- 2. `marketing_drafts` IS business-scoped (has business_id) and, unlike
--    the platform tables above, has a real owner: confirmed by grep that
--    it has zero technician/public reader, only the owner-authed
--    DispatcherView (approve/reject buttons) and background agents (now
--    service_role). SELECT + UPDATE now require
--    `auth.uid() = businesses.owner_user_id` for that row's business.
--    INSERT (only ever done by generate-growth-drafts, now service_role)
--    no longer needs an anon policy either.
--
-- Deliberately NOT touched by this pass (same reasoning as pass 1, still
-- accurate): jobs, technicians, leads, invoices, technician_locations,
-- checklist_templates, checklist_photos, job_materials, inventory_items,
-- technician_credentials, businesses, roi_proposals, all industrial_*
-- tables. All of these have a genuine anonymous technician (PIN, no
-- auth.uid()) or public client-facing reader (tracking/invoice/quote/
-- dispute/proposal links) that would break if scoped to auth.uid() today.
-- Closing that gap needs a real technician auth session, which is a
-- separate, larger, scoped project — not folded into this delta.
--
-- Safe to run once. Uses `drop policy if exists` before each replacement
-- so re-running this file is harmless.
-- ============================================================

-- agent_functions — platform-wide operator data, not business-scoped.
drop policy if exists "anon select agent_functions" on agent_functions;
drop policy if exists "anon insert agent_functions" on agent_functions;
drop policy if exists "anon update agent_functions" on agent_functions;
drop policy if exists "anon delete agent_functions" on agent_functions;
create policy "admin select agent_functions" on agent_functions
  for select using (
    exists (select 1 from admin_users a where a.user_id = auth.uid())
  );
create policy "admin update agent_functions" on agent_functions
  for update using (
    exists (select 1 from admin_users a where a.user_id = auth.uid())
  );

-- agent_insights — platform-wide operator data (business_id nullable,
-- cross-business insights allowed by design).
drop policy if exists "anon select agent_insights" on agent_insights;
drop policy if exists "anon insert agent_insights" on agent_insights;
drop policy if exists "anon update agent_insights" on agent_insights;
drop policy if exists "anon delete agent_insights" on agent_insights;
create policy "admin select agent_insights" on agent_insights
  for select using (
    exists (select 1 from admin_users a where a.user_id = auth.uid())
  );

-- agent_council_reports — platform-wide weekly operator summary, no
-- business_id column at all.
drop policy if exists "anon select agent_council_reports" on agent_council_reports;
drop policy if exists "anon insert agent_council_reports" on agent_council_reports;
drop policy if exists "anon update agent_council_reports" on agent_council_reports;
drop policy if exists "anon delete agent_council_reports" on agent_council_reports;
create policy "admin select agent_council_reports" on agent_council_reports
  for select using (
    exists (select 1 from admin_users a where a.user_id = auth.uid())
  );

-- marketing_drafts — business-scoped, confirmed read only from the
-- owner-authed DispatcherView (Growth tab) + now-service_role agents.
drop policy if exists "anon select marketing_drafts" on marketing_drafts;
drop policy if exists "anon insert marketing_drafts" on marketing_drafts;
drop policy if exists "anon update marketing_drafts" on marketing_drafts;
create policy "owner select marketing_drafts" on marketing_drafts
  for select using (
    exists (
      select 1 from businesses b
      where b.id = marketing_drafts.business_id
        and b.owner_user_id = auth.uid()
    )
  );
create policy "owner update marketing_drafts" on marketing_drafts
  for update using (
    exists (
      select 1 from businesses b
      where b.id = marketing_drafts.business_id
        and b.owner_user_id = auth.uid()
    )
  );
