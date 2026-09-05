-- ============================================================
-- MINERVA — Delta: subcontractor_pool server-side enforcement (2026-09-05,
-- agent/AI-function audit pass).
--
-- Same gap, same fix, as supabase_schema_delta_operational_fixes.sql's
-- crew_splitting trigger (see that file's header for the full "why a
-- trigger, not an RLS policy or edge function check" reasoning — this app
-- has no auth.uid()-scoped RLS by design, and DispatcherView's
-- addSubcontractor() inserts straight from the browser with no edge
-- function in between).
--
-- What was missed: subcontractor_pool is a paid Minerva Max add-on
-- (src/maxAddons.js) and DispatcherView only shows the "+ Add" button /
-- Subcontractors tab when the addon is active — but nothing stopped an
-- insert into `subcontractors` directly (anon-all RLS, like every other
-- table in this schema) regardless of add-on status. Worse: auto-assign-
-- technician's subcontractor-fallback branch (see its header comment,
-- "Hybrid workforce fallback") would then happily auto-dispatch to any
-- subcontractor row that exists, paid or not, since it never checked the
-- add-on either — it only checks is_active/current_lat/current_lng.
--
-- This trigger only guards INSERT, same as crew_splitting's — removing/
-- deactivating a subcontractor is always allowed even if the add-on lapses,
-- so a business that downgrades doesn't get stuck with an
-- un-removable/un-deactivatable row.
-- ============================================================

create or replace function enforce_subcontractor_pool_addon() returns trigger as $$
declare
  biz record;
  addon_active boolean;
begin
  select max_addons, max_addon_trials into biz from businesses where id = new.business_id;
  addon_active := coalesce((biz.max_addons -> 'subcontractor_pool') = 'true'::jsonb, false)
    or coalesce((biz.max_addon_trials -> 'subcontractor_pool' ->> 'ends_at')::timestamptz > now(), false);
  if not addon_active then
    raise exception 'Subcontractor Pool (subcontractor_pool) is a Minerva Max add-on that is not enabled or trialing for this business — enable it from the MAX tab first.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_subcontractor_pool_addon on subcontractors;
create trigger trg_enforce_subcontractor_pool_addon
  before insert on subcontractors
  for each row execute function enforce_subcontractor_pool_addon();
