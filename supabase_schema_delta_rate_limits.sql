-- ============================================================
-- MINERVA - Delta: cost-abuse rate limiting for public AI-spending endpoints
-- (2026-09-16)
-- Adds 1 new table + 1 new function only. Nothing else in your live DB is
-- touched. Run this entire block once in the Supabase SQL Editor (or via
-- the Management API /database/query, same as every other delta this
-- session).
--
-- Why: ai-intake-chat and client-support-chat are public, unauthenticated
-- endpoints (reachable by anyone who has or guesses a businessId/jobId/
-- invoiceId) that spend real Anthropic API money per call once
-- ANTHROPIC_API_KEY is set. Both already cap payload size (see their own
-- code comments) but neither had a request-count limiter — each function's
-- own comment explicitly named this as "would need a new DB table +
-- migration to track it reliably across edge-function cold starts, not
-- added speculatively" — this delta is that table + migration.
--
-- check_rate_limit(key, window_seconds, max_requests) is a single atomic
-- INSERT ... ON CONFLICT so concurrent requests can't race past the limit
-- (Postgres row-locks the conflicting row for the duration of the upsert).
-- SECURITY DEFINER + owned by postgres so it works regardless of which
-- role calls it (RLS on the underlying table is irrelevant to a
-- SECURITY DEFINER function's own queries, since it runs as its owner).
-- ============================================================

create table rate_limit_counters (
  key           text primary key,
  window_start  timestamptz not null default now(),
  request_count int not null default 0
);
-- RLS enabled with NO policies at all — this table is only ever touched
-- through check_rate_limit() below, never read/written directly by any
-- role. Same "lock it down completely, no direct access" posture as
-- integration_credentials/voice_call_sessions (see SECURITY_NOTES.md).
alter table rate_limit_counters enable row level security;

create or replace function check_rate_limit(p_key text, p_window_seconds int, p_max_requests int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  insert into rate_limit_counters (key, window_start, request_count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set request_count = case
          when rate_limit_counters.window_start < now() - (p_window_seconds || ' seconds')::interval
          then 1
          else rate_limit_counters.request_count + 1
        end,
        window_start = case
          when rate_limit_counters.window_start < now() - (p_window_seconds || ' seconds')::interval
          then now()
          else rate_limit_counters.window_start
        end
  returning request_count into v_count;
  return v_count <= p_max_requests;
end;
$$;

grant execute on function check_rate_limit(text, int, int) to anon, authenticated, service_role;
