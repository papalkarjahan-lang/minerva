-- ============================================================
-- MINERVA — Delta: let industrial technicians actually see and check
-- into their assigned site, 2026-10-10. Adds 1 column + 3 RLS policies.
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this fixes: `TechnicianView.jsx` is the ONLY technician-facing
-- view in the app, used by every technician regardless of sector. It
-- discovers "what work is assigned to me" exclusively through
-- `technicians.current_job_id -> jobs` — a trade-only mechanism.
-- Industrial has no equivalent at all: no column on `technicians`
-- pointing at a `site_projects` row, no join table, nothing. Confirmed
-- by a full repo grep: zero code paths anywhere ever set such a thing,
-- and zero code paths anywhere ever INSERT into `site_checkins` either
-- (every reference to that table across src/ and supabase/functions/ is
-- a read). `Features.jsx`/`Enterprise.jsx` market "Multi-day site
-- tracking... arrival/departure check-ins" as a real, working,
-- industrial-sector capability — today it cannot produce a single row,
-- for any business, ever. Same "sold vs delivered" bug class already
-- found and fixed repeatedly this session (Pro tier, Standard tier,
-- Minerva Max add-ons, Pricing.jsx) — this is the most severe instance:
-- not wrong-sector, just entirely unbuilt. Three downstream agents
-- already consume `site_checkins` and have been doing so against a
-- permanently empty table since the industrial sector shipped: "The
-- Warden" (detect-safety-hazards, human/automated proximity detection),
-- "The Pacer" (sequence-handoffs, handoff nudging), and
-- package-client-verification (the client evidence-package export).
--
-- Fix shape: the minimum needed to make the ALREADY-MARKETED capability
-- real, mirroring the existing, proven trade-side pattern exactly rather
-- than inventing a new one. `technicians.current_job_id` is the
-- precedent; `technicians.current_site_id` is its direct sibling. No
-- new join table needed — unlike `jobs.technician_id` (one job, one
-- primary tech, crew handled separately via `job_assignments`), this
-- points the other way (FROM technician), so multiple technicians can
-- already share one `current_site_id` with nothing extra required — a
-- natural fit for multi-day site work where more than one person is
-- often on site at once.
--
-- Deliberately NOT building the 'automated_process' side of
-- `site_checkins` (the Warden/Pacer's other leg, referenced in
-- monitor-asset-telemetry's header comment but never actually wired to
-- write this table either). That's a separate, far more speculative
-- integration (what a piece of equipment "checking in" even means
-- physically isn't specified anywhere) and isn't itself a marketed,
-- customer-facing claim the way arrival/departure check-ins are — it's
-- left exactly as it already was, a dormant downstream consumer that
-- simply won't fire until/unless that side is built later. Not a
-- regression: it already never fired, since neither leg existed.
--
-- RLS: `site_projects`/`site_checkins` were correctly scoped to the
-- business OWNER's own session by `rls_scoping_v3.sql` (2026-09-14) —
-- "owner all ..." policies, `owner_user_id = auth.uid()`. A technician's
-- own authenticated session (PIN login, `technicians.auth_user_id`) is a
-- DIFFERENT auth.uid() than the owner's and satisfies neither policy at
-- all — confirmed by reading that exact policy text before writing any
-- UI, not assumed. Without the two new policies below, a technician's
-- check-in screen would load, every read/write would be silently
-- RLS-filtered or rejected, and the technician would see either a blank
-- site or a failed check-in with no indication why — the identical
-- near-miss shape already caught and fixed once today in
-- businesses_select_scoping.sql's own 4th branch, same root cause (a
-- technician's session is neither the owner nor anon, and every
-- RLS pass on this table so far only ever considered those two).
--
-- Technician gets SELECT only on `site_projects` (never writes a site)
-- and SELECT + INSERT only on `site_checkins` (reads their own
-- check-in history to know whether they're currently checked in; can
-- log a new check-in; cannot UPDATE or DELETE a past one — an
-- append-only field log, same posture as `technician_incidents`).
-- `WITH CHECK` on the insert ties the row's `business_id` to a business
-- the caller is actually a technician of, preventing a technician from
-- writing a check-in into a different business's log — mirrors the same
-- existing-tenant check already proven on every other technician-scoped
-- policy added this session.
-- ============================================================

alter table technicians
  add column current_site_id uuid references site_projects(id) on delete set null;

create policy "technician select site_projects" on site_projects
  for select
  using (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = site_projects.business_id)
  );

create policy "technician select site_checkins" on site_checkins
  for select
  using (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = site_checkins.business_id)
  );

create policy "technician insert own site_checkins" on site_checkins
  for insert
  with check (
    exists (select 1 from technicians t where t.auth_user_id = auth.uid() and t.business_id = site_checkins.business_id)
  );

-- Verify after running (in the Supabase SQL Editor, with a real
-- industrial test business/technician — DAY7_LAUNCH_CHECKLIST.md
-- section 9 has Standard-tier steps to crib the pattern from; create an
-- industrial-sector equivalent if one doesn't already exist):
--
-- set role authenticated;
-- set request.jwt.claims = '{"sub": "<technician''s auth_user_id>", "role": "authenticated"}';
-- select id, name, scope_of_work from site_projects where id = '<a real site id for that technician''s business>';
-- Expect: 1 row.
-- insert into site_checkins (site_id, business_id, person_name, role, checkin_type)
--   values ('<that site id>', '<that business id>', 'Test Tech', 'human_technician', 'arrival');
-- Expect: success.
-- select id, name, scope_of_work from site_projects where id = '<a site id belonging to a DIFFERENT business>';
-- Expect: 0 rows.
-- reset role;
--
-- Then confirm nothing existing broke: the business owner's own
-- IndustrialDispatcherView still loads/edits sites exactly as before
-- (the owner's "owner all ..." policies are untouched, these are purely
-- additive), and a TRADE technician's PIN login / job flow is
-- unaffected (this delta touches no trade table).
