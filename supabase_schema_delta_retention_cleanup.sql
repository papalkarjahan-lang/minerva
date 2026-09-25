-- ============================================================
-- MINERVA — retention cleanup for append-only/short-lived housekeeping
-- tables (2026-09-25).
--
-- Found while auditing every table with an expiry/timestamp column for
-- a cleanup path: three tables have NONE, and would otherwise grow
-- unbounded for the life of the business:
--
--   - xero_oauth_states: single-use OAuth state tokens, 15-minute
--     expires_at (supabase_schema_delta_xero_oauth_state.sql). A token
--     that's actually used gets deleted immediately by
--     xero-oauth-callback's claim-delete. But a token from an ABANDONED
--     flow — a business owner who clicks "Connect Xero" and then never
--     completes Xero's login screen — is never consumed and never
--     cleaned up. Harmless individually (tiny row, no sensitive data
--     beyond a business_id), but accumulates forever with zero
--     remaining value past its own 15-minute expiry.
--
--   - processed_stripe_events / processed_call_sids: idempotency logs
--     for stripe-webhook/missed-call-webhook (see their own delta files
--     for the dedup bug they fix). Every real Stripe event and every
--     real missed call this business ever receives adds one permanent
--     row, forever, by design — that's correct for their actual
--     purpose (dedup against provider retries), but neither provider
--     retries anywhere near long enough to need permanent retention:
--     Stripe's own docs describe retries over hours/days, not months;
--     Twilio's Voice webhook retries within seconds/minutes. Rows exist
--     purely so a re-delivery of the SAME event within that
--     window is recognized — nothing here has any purpose once that
--     window has long passed.
--
-- Fixed with three tiny daily pg_cron jobs doing a direct SQL DELETE
-- each — NOT edge functions — because unlike every other pg_cron job
-- in this codebase (which take real user-facing actions: sending SMS,
-- charging cards, nurturing leads), this is pure internal database
-- janitorial work with zero user-facing side effects and nothing to
-- ever kill-switch, so routing it through agent_functions/
-- record_agent_run health tracking would add ceremony with no benefit.
-- Retention windows are deliberately generous (90 days for the two
-- idempotency logs, 24 hours for oauth states) — nowhere close to
-- either provider's actual retry window, purely to leave a
-- comfortable debugging buffer.
-- ============================================================

select cron.schedule(
  'cleanup-xero-oauth-states-daily',
  '30 3 * * *',
  $$delete from xero_oauth_states where expires_at < now() - interval '24 hours';$$
);

select cron.schedule(
  'cleanup-processed-stripe-events-daily',
  '35 3 * * *',
  $$delete from processed_stripe_events where processed_at < now() - interval '90 days';$$
);

select cron.schedule(
  'cleanup-processed-call-sids-daily',
  '40 3 * * *',
  $$delete from processed_call_sids where processed_at < now() - interval '90 days';$$
);
