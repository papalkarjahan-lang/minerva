-- ============================================================
-- MINERVA — Delta: real technician authentication, part 1 of 2
-- (2026-09-14, schema + link column only — RLS tightening is in the
-- companion file supabase_schema_delta_technician_auth_rls_v1.sql,
-- deployed after the new technician-login edge function is live, same
-- "don't tighten RLS before the client that needs it exists" ordering
-- used for the service_role migration earlier this session).
--
-- CONTEXT: SECURITY_NOTES.md has always documented that `technicians`,
-- `jobs`, `technician_locations`, `job_materials`, `checklist_photos`,
-- `invoices`, `technician_credentials`, `job_assignments`, and
-- `inventory_items` can't be RLS-scoped because the technician side of
-- every one of those tables has always been a bare PIN check against the
-- anon key — no `auth.uid()` existed for a technician at all. That was a
-- deliberate, correctly-reasoned limitation, not an oversight.
--
-- This column is the one missing piece that unblocks it: a real Supabase
-- Auth user, one per technician, created lazily on first PIN login by the
-- new `technician-login` edge function (service_role, via
-- `supabase.auth.admin.createUser` + `generateLink`). The technician's
-- browser then holds a real session (`supabase.auth.verifyOtp`), so
-- `auth.uid()` is populated for every subsequent request from their
-- phone — exactly like `businesses.owner_user_id` already is for
-- dispatcher/owner sessions.
--
-- The PIN itself is NOT being removed or changed — technicians still get
-- the same SMS link with `?pin=...`, same low-friction, no-password UX.
-- The PIN becomes an exchange credential (used once per session to mint a
-- real auth session) instead of being the entire security model.
--
-- Safe to run once. Purely additive — no existing column touched, no
-- policy changed yet (that's the companion file).
-- ============================================================

alter table technicians add column if not exists auth_user_id uuid references auth.users(id) on delete set null;

-- One technician <-> one synthetic auth user. Partial index (not a
-- table-level unique constraint) so multiple NULLs (not-yet-logged-in
-- technicians) are allowed.
create unique index if not exists technicians_auth_user_id_key
  on technicians(auth_user_id)
  where auth_user_id is not null;
