-- ============================================================
-- MINERVA - Delta: RLS read-scoping, pass 1 (2026-09-05)
--
-- CONTEXT: after auditing every `.from(...)` call across src/ and
-- supabase/functions/, almost every table in this schema is read by at
-- least one of: an anonymous technician session (PIN link, no Supabase
-- auth), an anonymous public page (client portal / tracking / invoice /
-- quote view), or a background agent edge function running on the `anon`
-- key that intentionally reads/writes ACROSS businesses (nurture-stale-
-- leads, daily-digest, check-inventory-levels, etc.). None of those have
-- an `auth.uid()`, so scoping SELECT to `auth.uid() = businesses.owner_
-- user_id` on any of those tables would silently return zero rows for
-- real, currently-working product features. See SECURITY_NOTES.md and
-- README.md for the fuller reasoning on why full tenant isolation is
-- deferred until technicians/background agents have their own auth
-- story.
--
-- What THIS delta does instead: tightens SELECT only, and only on the
-- small set of tables confirmed (by grep, not guesswork) to be read
-- EXCLUSIVELY from the now-auth-gated DispatcherView (owner login via
-- supabase_schema_delta_owner_auth.sql) or the staff-only admin console.
-- INSERT/UPDATE/DELETE policies on these tables are untouched — still
-- open, same as before — because technicians and background agents may
-- still need to write to some of them later; only reads are scoped here.
--
-- Tables touched:
--   assets, subcontractors, technician_incidents, upsell_nudge_dismissals
--     -> SELECT now requires auth.uid() = the row's business's owner_user_id
--   support_requests
--     -> SELECT now requires auth.uid() to be in the new admin_users table
--      (this is a staff inbox, not a business-owner-facing table)
--
-- New table: admin_users — maps a Supabase auth user to "is Minerva staff."
-- Nobody is in it yet (VITE_ADMIN_EMAILS hasn't been set / no one has
-- logged into /admin yet), so this is safe to ship now with zero rows.
-- To make a real person an admin later, once they've logged in once via
-- /login with their own email:
--   insert into admin_users (user_id, email)
--   select id, email from auth.users where email = 'someone@yourcompany.com';
--
-- Safe to run once. Uses `drop policy if exists` before each replacement
-- so re-running this file is harmless.
-- ============================================================

create table if not exists admin_users (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  created_at  timestamptz default now()
);
alter table admin_users enable row level security;
drop policy if exists "self select admin_users" on admin_users;
create policy "self select admin_users" on admin_users
  for select using (auth.uid() = user_id);
grant select on admin_users to authenticated;

-- assets — confirmed read only from DispatcherView.jsx (owner-authenticated)
drop policy if exists "anon select assets" on assets;
create policy "owner select assets" on assets
  for select using (
    exists (
      select 1 from businesses b
      where b.id = assets.business_id
        and b.owner_user_id = auth.uid()
    )
  );

-- subcontractors — confirmed read only from DispatcherView.jsx
drop policy if exists "anon all subcontractors" on subcontractors;
create policy "owner select subcontractors" on subcontractors
  for select using (
    exists (
      select 1 from businesses b
      where b.id = subcontractors.business_id
        and b.owner_user_id = auth.uid()
    )
  );
create policy "anon insert subcontractors" on subcontractors
  for insert with check (true);
create policy "anon update subcontractors" on subcontractors
  for update using (true);
create policy "anon delete subcontractors" on subcontractors
  for delete using (true);

-- technician_incidents — confirmed read only from DispatcherView.jsx
drop policy if exists "anon all technician_incidents" on technician_incidents;
create policy "owner select technician_incidents" on technician_incidents
  for select using (
    exists (
      select 1 from businesses b
      where b.id = technician_incidents.business_id
        and b.owner_user_id = auth.uid()
    )
  );
create policy "anon insert technician_incidents" on technician_incidents
  for insert with check (true);
create policy "anon update technician_incidents" on technician_incidents
  for update using (true);
create policy "anon delete technician_incidents" on technician_incidents
  for delete using (true);

-- upsell_nudge_dismissals — confirmed read only from DispatcherView.jsx
drop policy if exists "anon all upsell_nudge_dismissals" on upsell_nudge_dismissals;
create policy "owner select upsell_nudge_dismissals" on upsell_nudge_dismissals
  for select using (
    exists (
      select 1 from businesses b
      where b.id = upsell_nudge_dismissals.business_id
        and b.owner_user_id = auth.uid()
    )
  );
create policy "anon insert upsell_nudge_dismissals" on upsell_nudge_dismissals
  for insert with check (true);
create policy "anon update upsell_nudge_dismissals" on upsell_nudge_dismissals
  for update using (true);
create policy "anon delete upsell_nudge_dismissals" on upsell_nudge_dismissals
  for delete using (true);

-- support_requests — staff inbox, not owner-facing. SELECT now admin-only;
-- insert/update/delete untouched (ContactSupportModal still submits anon).
drop policy if exists "anon select support_requests" on support_requests;
create policy "admin select support_requests" on support_requests
  for select using (
    exists (select 1 from admin_users a where a.user_id = auth.uid())
  );
