-- ============================================================
-- MINERVA — fix forged-callback vulnerability in the Xero OAuth flow
-- (2026-09-25).
--
-- xero-oauth-connect already verifies the caller owns businessIdParam
-- before starting a flow — but xero-oauth-callback (the actual redirect
-- target Xero calls back to) trusted the OAuth `state` param as the
-- target business_id with NO verification that this specific
-- authorization code was ever issued as part of a flow started for that
-- business. Xero itself doesn't validate `state` against anything — it's
-- an opaque value the client sets on the way out and gets echoed back
-- unchanged. That means an attacker who knows Minerva's client_id and
-- redirect_uri (learnable by starting one legitimate flow for a business
-- they DO control, since neither value is secret) could construct their
-- own Xero authorize URL, log in with their OWN Xero account, and set
-- `state` to a victim's business_id directly. xero-oauth-callback would
-- then store the ATTACKER's real Xero tokens under the VICTIM's
-- business_id — every future invoice/contact sync for that victim
-- business would silently push real client data into the attacker's own
-- Xero organization, with the victim's UI showing "Connected" the whole
-- time.
--
-- Fixed by replacing the raw businessId `state` value with a random,
-- unguessable, single-use, short-lived opaque token minted only after
-- xero-oauth-connect's existing ownership check passes. xero-oauth-callback
-- now looks up the token (atomically deleting it on first use, so a
-- replayed/duplicated callback request can't reuse it) instead of trusting
-- any business_id supplied directly by the caller.
-- ============================================================

create table if not exists xero_oauth_states (
  state       text primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

alter table xero_oauth_states enable row level security;
-- Same reasoning as integration_credentials directly above: no anon/
-- authenticated policy on purpose. Only the two Xero edge functions
-- (via the service role key) ever touch this table.
grant select, insert, delete on xero_oauth_states to service_role;
