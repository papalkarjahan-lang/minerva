-- ============================================================
-- MINERVA - Delta: close open UPDATE/DELETE on support_requests (2026-09-29)
-- Run this entire block once in the Supabase SQL Editor (or via the
-- Management API /database/query endpoint).
--
-- What this fixes: supabase_schema_delta_support_requests.sql (2026-09-05)
-- granted UPDATE and DELETE on support_requests to anon/authenticated with
-- a blanket `using (true)` policy. rls_scoping_v1.sql (2026-09-05, same
-- day) scoped SELECT to admin_users membership but explicitly left
-- INSERT/UPDATE/DELETE untouched, intending to come back to writes later
-- — that follow-up never happened. AdminConsole.jsx's own resolveRequest/
-- saveRequestNotes functions are the only real UPDATE callers in the app
-- (both admin-only actions), and nothing in the app ever calls DELETE on
-- this table — so the current wide-open policies aren't required by any
-- shipped feature, they're just an unclosed gap.
--
-- Real-world impact of the gap: the anon key ships in the client JS
-- bundle, so ANY visitor (no login required) can currently mark any
-- business's support ticket resolved, overwrite admin_notes with
-- arbitrary text, or delete rows outright — a single unauthenticated
-- `.delete().not('id','is',null)` call empties the entire support inbox
-- for every business on the platform.
--
-- Fix: scope both UPDATE and DELETE to admin_users membership, same
-- pattern already used for this table's SELECT policy and for businesses'
-- UPDATE policy (rls_scoping_v3.sql).
-- ============================================================

drop policy if exists "anon update support_requests" on support_requests;
create policy "admin update support_requests" on support_requests
  for update using (
    exists (select 1 from admin_users a where a.user_id = auth.uid())
  );

drop policy if exists "anon delete support_requests" on support_requests;
create policy "admin delete support_requests" on support_requests
  for delete using (
    exists (select 1 from admin_users a where a.user_id = auth.uid())
  );
