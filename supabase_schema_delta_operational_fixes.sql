-- ============================================================
-- MINERVA — Delta: operational-fidelity fixes (2026-09-04, "free time"
-- audit pass). Found via a systematic audit of technician-phone flows,
-- cross-agent/cross-system links, and doc-vs-code accuracy. Purely
-- additive — one new column, a backfill of agent_functions rows for
-- cron functions that were deployed/scheduled but never registered with
-- the Agent OS health-tracking system (so they were invisible to
-- test-agent-health and the kill-switch, even though the switch itself
-- isn't read by any function yet — see agent_infra.sql's own header note),
-- and a trigger closing the crew_splitting addon-gating gap below.
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

-- invoices.client_sms_failed: set by TechnicianView's submitInvoice() when
-- send-invoice-sms returns an error. Previously this failure was silent —
-- the invoice was created but the client never got a payment link, and
-- nobody knew. Surfaced as a warning badge in DispatcherView's Invoices tab.
alter table invoices add column client_sms_failed boolean not null default false;

-- New rows for the 5 cron functions found deployed+scheduled but missing
-- from agent_functions (predict-asset-maintenance, detect-idle-assets,
-- estimate-job-carbon, forecast-demand were never seeded; agent-council-report
-- and test-agent-health are Agent OS infrastructure itself, explicitly
-- tagged 'system' rather than a business-facing agent). on conflict do
-- nothing since agent_functions.name is unique and some of these may
-- already exist from a prior partial run.
insert into agent_functions (name, agent) values
  ('predict-asset-maintenance', 'asset_intelligence'),
  ('detect-idle-assets', 'asset_intelligence'),
  ('estimate-job-carbon', 'environment'),
  ('forecast-demand', 'marketing'),
  ('agent-council-report', 'system'),
  ('test-agent-health', 'system')
on conflict (name) do nothing;

-- ------------------------------------------------------------
-- crew_splitting server-side enforcement.
--
-- This app has no Supabase Auth / auth.uid() by design (see
-- supabase_schema.sql's RLS header note) — every table's RLS policy is
-- `using (true)`, and access control is entirely application-layer
-- (unguessable dispatch/tracking links + businessId filtering in queries).
-- That means a normal RLS policy referencing max_addons wouldn't add real
-- enforcement here: there's no per-user session to scope it by, and the
-- anon key can already read/write any row regardless of policy wording.
--
-- DispatcherView's addCrewMember()/removeCrewMember() call
-- supabase.from('job_assignments').insert()/.delete() directly from the
-- frontend — there's no edge function in the middle to add a 403 check to
-- (unlike ai_quotes/draft-quote). So instead of an edge-function check or
-- a no-op RLS policy, this uses a BEFORE INSERT trigger: the one place
-- that's actually enforced no matter which client (browser, curl, a future
-- integration) performs the insert. It only guards INSERT — removing crew
-- is always allowed even if the addon lapses, so a business that
-- downgrades doesn't get stuck with an un-removable crew assignment.
create or replace function enforce_crew_splitting_addon() returns trigger as $$
declare
  biz record;
  addon_active boolean;
begin
  select max_addons, max_addon_trials into biz from businesses where id = new.business_id;
  addon_active := coalesce((biz.max_addons -> 'crew_splitting') = 'true'::jsonb, false)
    or coalesce((biz.max_addon_trials -> 'crew_splitting' ->> 'ends_at')::timestamptz > now(), false);
  if not addon_active then
    raise exception 'Multi-Tech Job Splitting (crew_splitting) is a Minerva Max add-on that is not enabled or trialing for this business — enable it from the MAX tab first.';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_enforce_crew_splitting_addon on job_assignments;
create trigger trg_enforce_crew_splitting_addon
  before insert on job_assignments
  for each row execute function enforce_crew_splitting_addon();

-- ------------------------------------------------------------
-- Invoice void (soft-delete) audit trail.
--
-- There was previously no way to correct a mistakenly-created invoice in
-- the UI at all — "Mark paid" was the only action available. There is also
-- no delete RLS policy on invoices (see supabase_schema.sql), so a hard
-- delete was never actually reachable via the anon key either way. This
-- adds an explicit void path instead of ever adding a delete policy: status
-- moves to 'void' (chase-unpaid-invoices already only queries
-- status = 'unpaid', so voided invoices stop being chased for free) and the
-- reason + timestamp are kept for the audit trail rather than the invoice
-- just disappearing.
alter table invoices add column voided_at timestamptz;
alter table invoices add column voided_reason text;
