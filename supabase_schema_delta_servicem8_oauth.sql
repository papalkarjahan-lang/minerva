-- ============================================================
-- MINERVA — ServiceM8 OAuth connector (2026-10-30)
--
-- First step of the "fit in, not just replace" integration strategy:
-- let a business keep ServiceM8 for dispatch/invoicing and connect it to
-- Minerva for the pieces ServiceM8 doesn't do well (whole-fleet route
-- optimization, AI call handling, review/win-back automation) — instead
-- of asking them to migrate off a system they already use.
--
-- Mirrors xero_oauth_states exactly, same reasoning, same
-- forged-callback protection (see servicem8-oauth-connect/index.ts and
-- servicem8-oauth-callback/index.ts header comments, which are direct
-- adaptations of xero-oauth-connect/xero-oauth-callback's already-hardened
-- 2026-09-25 fix — this ships with that fix already applied, not as a
-- later patch, since there's no reason to re-introduce a vulnerability
-- that's already been found and fixed once in the sibling integration).
--
-- No new credentials table needed — integration_credentials.provider is
-- already free-text ('xero' | 'myob' (not built) | now 'servicem8'), built
-- provider-agnostic from the start. Only a new oauth_states table (the
-- state-token shape is provider-specific by nature — each state row
-- belongs to exactly one provider's flow) and a cheap anon-readable
-- boolean column, same shape as xero_connected.
-- ============================================================

create table if not exists servicem8_oauth_states (
  state       text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table servicem8_oauth_states enable row level security;
-- Same reasoning as xero_oauth_states: no anon/authenticated policy on
-- purpose. Only the two ServiceM8 edge functions (via the service role
-- key) ever touch this table.
grant select, insert, delete on servicem8_oauth_states to service_role;

-- businesses.servicem8_connected — cheap boolean the frontend (anon key)
-- can read to show "Connected" state without touching the real token
-- table, same shape as xero_connected.
alter table businesses add column if not exists servicem8_connected boolean default false;
