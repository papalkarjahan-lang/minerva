-- ============================================================
-- MINERVA — missed-call-webhook event idempotency (2026-09-24, Round 44
-- continued further still).
--
-- Same bug class just fixed in stripe-webhook, different provider. Twilio's
-- own docs document that it retries a Voice webhook request on timeout (and
-- can otherwise redeliver), and missed-call-webhook/index.ts had zero dedup:
-- it doesn't even read CallSid (Twilio's unique-per-call identifier) from
-- the incoming form data at all. Every retried delivery of the same missed
-- call unconditionally re-sent the "we missed your call" SMS to the real
-- caller's real phone number — an unbounded-repeat risk on a real person,
-- not just an internal email like the stripe-webhook case.
--
-- processed_call_sids: minimal table, service_role-only (same
-- no-anon-policy pattern as processed_stripe_events/rate_limit_counters/
-- voice_call_sessions — nothing here is ever read/written by anon or
-- authenticated roles). index.ts checks CallSid against this table before
-- entering the SMS-send block; if already present, the SMS is skipped but
-- valid TwiML is still returned (a Twilio retry must never make the caller
-- hear an error). Row is inserted only after the SMS-send block has fully
-- run (success or handled failure) — mirroring stripe-webhook's
-- check-before/mark-after design.
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

create table if not exists processed_call_sids (
  call_sid text primary key,
  processed_at timestamptz not null default now()
);

alter table processed_call_sids enable row level security;

grant select, insert on processed_call_sids to service_role;
