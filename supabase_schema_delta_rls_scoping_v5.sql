-- ============================================================
-- MINERVA — Delta: RLS scoping v5 (2026-09-30, follow-up sweep).
--
-- WHY: after closing the technician_incidents/custom_workflows/
-- workflow_runs gap (supabase_schema_delta_agent_expansion_rls_scoping.sql,
-- same day), ran a full re-sweep of EVERY table's policy lineage (not just
-- tables created since 2026-09-24) to check for the same bug class
-- elsewhere. Found 5 more tables with an unscoped `using(true)`/
-- `with check(true)` INSERT/UPDATE/DELETE (or SELECT) policy that were
-- never narrowed, despite being written directly by the anon/
-- authenticated frontend client from DispatcherView.jsx — not the
-- documented/deferred "unguessable-link SELECT" model
-- (SECURITY_NOTES.md "the big one"), which is specifically about narrow,
-- single-row-by-id SELECT on public client-facing pages, not open
-- table-wide write access gated by nothing but a guessable business_id:
--
--   subcontractors — anon insert/update/delete `(true)` since 2026-09-05
--     (rls_scoping_v1), SELECT re-opened to anon `(true)` on 2026-09-07
--     (subcontractors_select_fix.sql) because auto-assign-technician's
--     subcontractor-fallback read was silently returning zero rows under
--     RLS. Re-verified 2026-09-30: auto-assign-technician now uses
--     SUPABASE_SERVICE_ROLE_KEY (confirmed via grep), which bypasses RLS
--     entirely — the 2026-09-07 premise no longer holds, so SELECT can
--     safely go back to owner-scoped too. Confirmed via grep: only
--     DispatcherView.jsx writes this table directly (add/deactivate
--     subcontractor); auto-assign-technician only reads it, via service
--     role.
--   upsell_nudge_dismissals — anon insert/update/delete `(true)` since
--     2026-09-05, never revisited. Confirmed via grep: only
--     DispatcherView.jsx touches this table (select + insert only — no
--     update/delete anywhere in the frontend, so those policies are
--     dropped outright rather than re-scoped).
--   weather_reschedule_drafts — anon insert/select/update `(true)` since
--     table creation (baseline supabase_schema.sql), never revisited.
--     Confirmed via grep: check-weather-risk (the only inserter) and
--     send-weather-reschedule-sms (the only status-transition-to-sent
--     writer) both use the service-role key. DispatcherView.jsx only
--     selects and does one direct update (the "Dismiss" click) — never
--     inserts. So no anon/owner INSERT policy is needed at all.
--   lead_activities — anon select/insert `(true)` since
--     supabase_schema_delta_lead_crm_pipeline.sql, never revisited.
--     Confirmed via grep: only DispatcherView.jsx touches this table
--     directly (manual note/call-log insert + timeline select). The
--     log_lead_stage_change trigger (SECURITY INVOKER, the plpgsql
--     default — no `security definer` in its definition) auto-inserts a
--     row whenever leads.pipeline_stage changes; confirmed via grep that
--     no edge function ever writes pipeline_stage, only
--     DispatcherView.jsx's owner-authenticated session — so the trigger
--     always fires as the same owner whose owner-scoped INSERT check
--     below will pass.
--   assets (Pro tier) — anon insert/update `(true)` since baseline
--     schema, SELECT already scoped to owner in rls_scoping_v1. Confirmed
--     via grep: only DispatcherView.jsx touches the literal `assets`
--     table (add/assign/update status) — no edge function ever calls
--     `.from('assets')` (the string "assets" appearing in several
--     industrial-tier edge functions is `industrial_assets`, a separate,
--     already-correctly-scoped table — not a match).
--
-- Impact if left open: any anon-key holder who has ever seen one of a
-- business's own public tracking/invoice/quote links (which contain that
-- business's business_id, not a secret in this app's model) could read,
-- forge, alter, or delete another business's subcontractor roster, quiet
-- their own dismissed-upsell-nudge state, read/forge/dismiss another
-- business's pending client-facing weather-reschedule warnings (leaking
-- client name/address), read or forge free-text CRM call-log/note entries
-- across every business's lead pipeline, or forge/alter equipment-tracking
-- (assets) rows.
--
-- Same owner-ownership pattern as every other scoping delta in this
-- project. Safe to run any time — `drop policy if exists` before each
-- create, so re-running this file is harmless. No data changes.
-- ============================================================

-- ---------- SUBCONTRACTORS ----------
drop policy if exists "anon select subcontractors" on subcontractors;
drop policy if exists "owner select subcontractors" on subcontractors;
drop policy if exists "anon insert subcontractors" on subcontractors;
drop policy if exists "anon update subcontractors" on subcontractors;
drop policy if exists "anon delete subcontractors" on subcontractors;

create policy "owner select subcontractors" on subcontractors
  for select using (
    exists (select 1 from businesses b where b.id = subcontractors.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner insert subcontractors" on subcontractors
  for insert with check (
    exists (select 1 from businesses b where b.id = subcontractors.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner update subcontractors" on subcontractors
  for update using (
    exists (select 1 from businesses b where b.id = subcontractors.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner delete subcontractors" on subcontractors
  for delete using (
    exists (select 1 from businesses b where b.id = subcontractors.business_id and b.owner_user_id = auth.uid())
  );

-- ---------- UPSELL_NUDGE_DISMISSALS ----------
drop policy if exists "owner select upsell_nudge_dismissals" on upsell_nudge_dismissals;
drop policy if exists "anon insert upsell_nudge_dismissals" on upsell_nudge_dismissals;
drop policy if exists "anon update upsell_nudge_dismissals" on upsell_nudge_dismissals;
drop policy if exists "anon delete upsell_nudge_dismissals" on upsell_nudge_dismissals;

create policy "owner select upsell_nudge_dismissals" on upsell_nudge_dismissals
  for select using (
    exists (select 1 from businesses b where b.id = upsell_nudge_dismissals.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner insert upsell_nudge_dismissals" on upsell_nudge_dismissals
  for insert with check (
    exists (select 1 from businesses b where b.id = upsell_nudge_dismissals.business_id and b.owner_user_id = auth.uid())
  );
-- No update/delete policy — unused by any frontend or edge-function path.

-- ---------- WEATHER_RESCHEDULE_DRAFTS ----------
drop policy if exists "anon insert weather_reschedule_drafts" on weather_reschedule_drafts;
drop policy if exists "anon select weather_reschedule_drafts" on weather_reschedule_drafts;
drop policy if exists "anon update weather_reschedule_drafts" on weather_reschedule_drafts;

create policy "owner select weather_reschedule_drafts" on weather_reschedule_drafts
  for select using (
    exists (select 1 from businesses b where b.id = weather_reschedule_drafts.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner update weather_reschedule_drafts" on weather_reschedule_drafts
  for update using (
    exists (select 1 from businesses b where b.id = weather_reschedule_drafts.business_id and b.owner_user_id = auth.uid())
  );
-- No insert policy — the only inserter (check-weather-risk) uses the
-- service-role key, which bypasses RLS entirely.

-- ---------- LEAD_ACTIVITIES ----------
drop policy if exists "anon select lead_activities" on lead_activities;
drop policy if exists "anon insert lead_activities" on lead_activities;

create policy "owner select lead_activities" on lead_activities
  for select using (
    exists (select 1 from businesses b where b.id = lead_activities.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner insert lead_activities" on lead_activities
  for insert with check (
    exists (select 1 from businesses b where b.id = lead_activities.business_id and b.owner_user_id = auth.uid())
  );

-- ---------- ASSETS ----------
drop policy if exists "anon insert assets" on assets;
drop policy if exists "owner select assets" on assets;
drop policy if exists "anon update assets" on assets;

create policy "owner select assets" on assets
  for select using (
    exists (select 1 from businesses b where b.id = assets.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner insert assets" on assets
  for insert with check (
    exists (select 1 from businesses b where b.id = assets.business_id and b.owner_user_id = auth.uid())
  );
create policy "owner update assets" on assets
  for update using (
    exists (select 1 from businesses b where b.id = assets.business_id and b.owner_user_id = auth.uid())
  );
