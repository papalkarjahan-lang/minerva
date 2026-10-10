-- ============================================================
-- MINERVA — Delta: a real place for a client's SMS reply to land,
-- 2026-10-11. Adds 1 table, no new column. Run this entire block once in
-- the Supabase SQL Editor. The matching retention cron lives in
-- supabase_schema_delta_incoming_sms_webhook_cron.sql — kept separate per
-- this project's established convention of never mixing DDL and live
-- cron.schedule() calls in the same delta file (see
-- supabase_schema_delta_minerva_max_cron.sql's own header).
--
-- What this fixes: every transactional SMS this product sends (ETA,
-- job assignment... actually those are technician-facing, but
-- completion, invoice, quote, review-request — all client-facing)
-- invites a reply by simply being a text message, and nothing in this
-- codebase has ever handled an incoming SMS at all. Confirmed by
-- grepping for any incoming-SMS/reply webhook — zero exist, only
-- `missed-call-webhook` for voice. A real client who types back
-- "running late, can you come at 3 instead?" currently has that message
-- go nowhere a business owner would ever see it in their normal Minerva
-- workflow — at best it sits in the Twilio Console, which nobody checks
-- as part of daily operations. Not documented as a known, deliberate
-- gap anywhere in this project's otherwise-thorough habit of flagging
-- limitations (checked README.md/SECURITY_NOTES.md and the sales docs
-- before concluding this was genuinely unnoticed, not already decided).
--
-- Architecture question resolved before building anything: Minerva's
-- SMS all send from one of two numbers — a business's own
-- `businesses.twilio_number` if they've set one, or the shared
-- `TWILIO_PHONE_NUMBER` platform secret as fallback (see every
-- send-*-sms function's own header). `missed-call-webhook` already
-- solves the identical "shared number, which business does this belong
-- to" problem for voice calls, via a `twilio_number = To` lookup — this
-- mirrors that exact, already-proven pattern rather than inventing a
-- new one. A business on the shared fallback number has the same
-- inherent ambiguity missed-call-webhook already accepts; not a new
-- limitation this delta introduces.
--
-- processed_sms_sids: same minimal, service_role-only idempotency table
-- as processed_call_sids (Twilio retries Messaging webhooks the same
-- way it retries Voice ones).
-- ============================================================

create table if not exists processed_sms_sids (
  message_sid text primary key,
  processed_at timestamptz not null default now()
);

alter table processed_sms_sids enable row level security;

grant select, insert on processed_sms_sids to service_role;

-- Verify after running: select * from processed_sms_sids limit 1; -- expect: succeeds, empty
