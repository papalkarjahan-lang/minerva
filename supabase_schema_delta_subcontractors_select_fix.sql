-- ============================================================
-- MINERVA - Fix: restore anon SELECT on subcontractors (2026-09-07)
--
-- BUG: supabase_schema_delta_rls_scoping_v1.sql (2026-09-05) locked
-- subcontractors' SELECT policy to `auth.uid() = businesses.owner_user_id`
-- only, based on an audit that found it "read only from
-- DispatcherView.jsx" — true at the time, but auto-assign-technician's
-- subcontractor-fallback dispatch code (added in a LATER commit, 09aa680)
-- also reads this table, running on the plain anon key with no login
-- session (same as all ~45 other background agent edge functions in this
-- codebase — see SECURITY_NOTES.md). Since Postgres RLS default-denies
-- when no policy matches the calling role, and no anon SELECT policy was
-- left on this table, every anon-key SELECT (i.e. every call from
-- auto-assign-technician) has been silently returning zero rows since
-- 2026-09-05. Effect: subcontractor-pool fallback dispatch has been
-- silently non-functional — a business with the subcontractor_pool add-on
-- active and a genuinely free subcontractor never gets it suggested when
-- no employed technician is free, with no error anywhere (empty result,
-- not a thrown error).
--
-- FIX: restore an anon SELECT policy. This does not reduce security below
-- what's already true today — INSERT/UPDATE/DELETE on this table are
-- already fully open to anon (`using (true)`, unchanged since 2026-09-05),
-- so an anon caller who can already write/overwrite any row could already
-- read data back via `.select()` on their own insert/update anyway. The
-- owner-scoped SELECT policy from 2026-09-05 is left in place (harmless,
-- redundant for the owner-authenticated case now that anon SELECT is also
-- open, but no reason to remove it).
--
-- Safe to run once. Idempotent (drop-if-exists before create).
-- ============================================================

drop policy if exists "anon select subcontractors" on subcontractors;
create policy "anon select subcontractors" on subcontractors
  for select using (true);
