-- ============================================================
-- MINERVA - Delta: support requests inbox (2026-09-05)
-- Adds 1 new table only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this adds: a "Contact support" form in DispatcherView/TechnicianView
-- writes here; the internal /admin console (AdminConsole.jsx) reads/replies.
-- Same wide-open `using (true)` RLS as the rest of this schema (see
-- SECURITY_NOTES.md) — consistent with every other table, not a new
-- exception.
-- ============================================================

create table support_requests (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id) on delete cascade,
  from_name     text,
  from_contact  text, -- email or phone, whatever they gave
  message       text not null,
  status        text default 'open', -- 'open' | 'resolved'
  admin_notes   text,
  created_at    timestamptz default now(),
  resolved_at   timestamptz
);
alter table support_requests enable row level security;
create policy "anon select support_requests" on support_requests for select using (true);
create policy "anon insert support_requests" on support_requests for insert with check (true);
create policy "anon update support_requests" on support_requests for update using (true);
create policy "anon delete support_requests" on support_requests for delete using (true);
grant select, insert, update, delete on support_requests to anon, authenticated, service_role;
