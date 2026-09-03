-- ============================================================
-- MINERVA — Delta: Agent Operating System, Phase 1 (infrastructure), 2026-09-01.
--
-- This is Phase 1 of a 5-phase "Agent Operating System" build. This file is
-- infra ONLY — it does not change the behaviour of any existing function,
-- table, or column. It lays the groundwork for three things, to be wired up
-- in later phases:
--   1. Compartmentalized kill-switches — a per-function `enabled` flag so a
--      single misbehaving agent can eventually be turned off without a code
--      deploy. NOTE: as of this file, no edge function actually checks its
--      own `enabled` flag yet — flipping it to false does nothing until each
--      function is updated to read it (tracked as a known follow-up, see
--      README.md). This file only creates the flag and its home table.
--   2. Cross-agent shared insights — a lightweight `agent_insights` table any
--      agent (or cron sweep) can write anomalies/patterns/suggestions to,
--      so future agents/phases can read what other agents have already
--      noticed instead of re-deriving it.
--   3. Automated self-testing — `agent_functions` is the data source for the
--      new `test-agent-health` edge function (deployed separately, see
--      supabase_schema_delta_agent_infra_cron.sql for its cron entry), which
--      flags functions that look stale or error-prone from run-history data
--      alone (no live invocation — see that function's own header comment
--      for why).
--
-- Covers BOTH the original autonomous functions (supabase_schema.sql) and
-- the Track A/B functions (supabase_schema_delta_agent_expansion.sql /
-- supabase_schema_delta_industrial.sql) — one row per existing edge function
-- in supabase/functions/, seeded with a best-guess `agent` grouping so
-- later phases can filter/report per-agent.
--
-- Standalone file, safe to run independently in the Supabase SQL Editor —
-- does not touch any existing table or column. Re-runnable: the seed insert
-- uses ON CONFLICT (name) DO NOTHING, and the rest is idempotent DDL.
--
-- Run order (see README.md "Agent Operating System — Phase 1"):
--   1. This file (supabase_schema_delta_agent_infra.sql)
--   2. Deploy the new function: supabase functions deploy test-agent-health
--   3. supabase_schema_delta_agent_infra_cron.sql (adds its cron entry)
--
-- Deliberately NOT included here: any cron.schedule() call. Per this
-- project's existing convention (see supabase_schema_delta_agent_cron.sql /
-- supabase_schema_delta_agent_infra_cron.sql), DDL and live cron scheduling
-- are always kept in separate delta files.
-- ============================================================

-- Table: agent_functions
-- One row per autonomous/cron-driven edge function. Home of the (not-yet-
-- wired) kill-switch flag, and the run-health data test-agent-health reads.
create table agent_functions (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null unique, -- edge function name, e.g. 'chase-unpaid-invoices'
  agent               text not null, -- 'outreach' | 'marketing' | 'scheduling' | 'research' | 'finance' | 'design' | 'core'
  enabled             boolean not null default true, -- kill-switch flag — NOT yet read by any function, see header comment
  last_run_at         timestamptz,
  last_status         text, -- 'ok' | 'error' | 'unknown'
  last_error          text,
  error_count         integer not null default 0, -- cumulative, never reset on success — a health signal, not a per-run flag
  last_health_alert_at timestamptz, -- throttles test-agent-health so it doesn't re-alert every 15 min for the same episode
  created_at          timestamptz default now()
);
alter table agent_functions enable row level security;
create policy "anon insert agent_functions" on agent_functions
  for insert with check (true);
create policy "anon select agent_functions" on agent_functions
  for select using (true);
create policy "anon update agent_functions" on agent_functions
  for update using (true);
create policy "anon delete agent_functions" on agent_functions
  for delete using (true);

-- Table: agent_insights
-- Cross-agent shared scratchpad. Any agent/sweep can write an observation
-- here for other agents (or a human) to read later. business_id is nullable
-- because some insights are cross-business/global (e.g. a health alert
-- about an infra function isn't tied to any one tenant).
create table agent_insights (
  id            uuid primary key default gen_random_uuid(),
  agent         text not null,
  insight_type  text not null, -- free text, e.g. 'anomaly' | 'pattern' | 'suggestion' | 'health_alert'
  summary       text not null,
  business_id   uuid references businesses(id), -- nullable — cross-business/global insights allowed
  related_table text,
  related_id    uuid,
  created_at    timestamptz default now()
);
alter table agent_insights enable row level security;
create policy "anon insert agent_insights" on agent_insights
  for insert with check (true);
create policy "anon select agent_insights" on agent_insights
  for select using (true);

-- Table-level grants — RLS policies above are inert without these (see the
-- 2026-09-02 outage note in supabase_schema.sql's ROW LEVEL SECURITY
-- section for the full story of why this line can't be skipped).
grant select, insert, update on agent_functions, agent_insights
to anon, authenticated, service_role;
create policy "anon update agent_insights" on agent_insights
  for update using (true);
create policy "anon delete agent_insights" on agent_insights
  for delete using (true);

-- Function: record_agent_run
-- Called (fire-and-forget) by edge functions on both their success and
-- error paths to keep agent_functions' run-health data current. Upserts by
-- name; error_count increments only on status='error' (cumulative — never
-- reset on a later success). If no row exists yet for fn_name (e.g. a
-- function added after this file was seeded), inserts one with agent='core'
-- so it still shows up in health checks rather than being silently dropped.
create or replace function record_agent_run(fn_name text, status text, error_msg text default null)
returns void as $$
begin
  insert into agent_functions (name, agent, last_run_at, last_status, last_error, error_count)
  values (fn_name, 'core', now(), status, error_msg, case when status = 'error' then 1 else 0 end)
  on conflict (name) do update set
    last_run_at = now(),
    last_status = excluded.last_status,
    last_error  = excluded.last_error,
    error_count = agent_functions.error_count + case when excluded.last_status = 'error' then 1 else 0 end;
end;
$$ language plpgsql;

-- Seed: one row per existing edge function in supabase/functions/, with a
-- best-guess `agent` mapping. Safe to re-run — ON CONFLICT (name) DO NOTHING.
insert into agent_functions (name, agent) values
  -- outreach
  ('nurture-stale-leads',        'outreach'),
  ('chase-unpaid-invoices',      'outreach'),
  ('retention-checkin',          'outreach'),
  ('winback-lost-leads',         'outreach'),
  ('ai-intake-chat',             'outreach'),
  -- marketing
  ('generate-growth-drafts',     'marketing'),
  ('launch-ad-campaign',         'marketing'),
  ('send-growth-message',        'marketing'),
  -- scheduling
  ('auto-assign-technician',     'scheduling'),
  ('detect-wasted-trips',        'scheduling'),
  ('check-weather-risk',         'scheduling'),
  ('update-technician-workload', 'scheduling'),
  -- finance
  ('reconcile-billing',          'finance'),
  ('check-credential-expiry',    'finance'),
  -- core (infra/other, incl. all industrial-sector + webhook/sms/on-demand functions)
  ('notify-slack',                  'core'),
  ('calendar-feed',                 'core'),
  ('daily-digest',                  'core'),
  ('check-inventory-levels',        'core'),
  ('verify-checklist-photos',       'core'),
  ('run-custom-workflows',          'core'),
  ('industrial-conductor',          'core'),
  ('harvest-industrial-leads',      'core'),
  ('enrich-industrial-leads',       'core'),
  ('monitor-asset-telemetry',       'core'),
  ('optimize-industrial-routes',    'core'),
  ('track-consumables',             'core'),
  ('detect-safety-hazards',         'core'),
  ('sequence-handoffs',             'core'),
  ('package-client-verification',   'core'),
  ('verify-industrial-compliance',  'core'),
  ('stripe-webhook',                'core'),
  ('missed-call-webhook',           'core'),
  ('send-completion-sms',           'core'),
  ('send-eta-sms',                  'core'),
  ('send-invoice-sms',              'core'),
  ('send-referral-code-sms',        'core'),
  ('send-setup-sms',                'core'),
  ('send-weather-reschedule-sms',   'core'),
  ('create-checkout-session',       'core'),
  ('sync-technician-billing',       'core')
on conflict (name) do nothing;
