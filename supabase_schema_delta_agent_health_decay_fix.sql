-- ============================================================
-- MINERVA - Delta: fix permanent false-positive agent health alerts (2026-09-15)
-- ============================================================
-- BUG FOUND: record_agent_run's error_count was cumulative with NO decay/
-- reset on success (see supabase_schema_delta_agent_infra.sql's original
-- comment: "cumulative — never reset on a later success"). Once any
-- function accumulated 5 total errors across its ENTIRE LIFETIME,
-- test-agent-health permanently flags it "unhealthy" forever, even while
-- it runs perfectly every cycle afterward — because last_run_at keeps
-- advancing past last_health_alert_at, the dedup logic re-fires a brand
-- new health_alert row on every single subsequent run, forever.
--
-- REAL IMPACT CONFIRMED LIVE: nurture-stale-leads accumulated 25 errors
-- (likely during initial setup/testing in early September, before Twilio
-- creds were fully in place), then ran fine for the next ~2 weeks
-- (last_status='ok', last_error=null throughout) — but still produced
-- 299 of the last 320 agent_insights health_alert rows since 2026-09-02,
-- one every single hourly run. This would silently spam OPERATOR_EMAIL
-- with a false "unhealthy" email every hour, forever, the moment that env
-- var is set (it's on the pending-setup list) — pure noise that would
-- also drown out any REAL future health problem in the same table.
--
-- FIX: error_count now decays by 1 on every successful run (floor 0),
-- and still increments by 1 on error — preserves the original intent
-- (catch functions erroring repeatedly / intermittently) without
-- permanently branding a since-recovered function as unhealthy. A
-- function has to be ACTIVELY accumulating errors faster than it
-- succeeds to stay over the threshold — a stale historical burst clears
-- itself out over the next several successful runs instead of lasting
-- forever.
--
-- Also resets the currently-stuck nurture-stale-leads counter immediately
-- (it's real-time confirmed healthy right now) so the alert noise stops
-- today rather than needing ~25 more hourly runs to decay out on its own.
--
-- Safe to re-run.
-- ============================================================

create or replace function record_agent_run(fn_name text, status text, error_msg text default null)
returns void as $$
begin
  insert into agent_functions (name, agent, last_run_at, last_status, last_error, error_count)
  values (fn_name, 'core', now(), status, error_msg, case when status = 'error' then 1 else 0 end)
  on conflict (name) do update set
    last_run_at = now(),
    last_status = excluded.last_status,
    last_error  = excluded.last_error,
    error_count = case
      when excluded.last_status = 'error' then agent_functions.error_count + 1
      else greatest(agent_functions.error_count - 1, 0)
    end;
end;
$$ language plpgsql;

-- One-time immediate reset for the function already confirmed healthy
-- right now, so the noise stops today instead of decaying out over ~25
-- more hourly runs.
update agent_functions
set error_count = 0
where name = 'nurture-stale-leads' and last_status = 'ok';
