-- ============================================================
-- MINERVA — Delta: client SMS opt-out (STOP/START), 2026-10-25.
-- Adds 1 table, no new column. Run this entire block once in the
-- Supabase SQL Editor.
--
-- What this fixes: every client-facing SMS this product sends (ETA,
-- completion, invoice, quote, review-request, referral code, job
-- cancelled/rescheduled, appointment reminder) either says "Reply here"
-- or is the kind of notification a client would reasonably reply to —
-- and send-appointment-reminder-sms in particular texts the same client
-- again for every future job. Nothing anywhere recognized a reply of
-- "STOP" as an opt-out request; incoming-sms-webhook logged it as an
-- ordinary client reply (a job note + Slack ping) and every future SMS
-- would still go out. Twilio does not reliably enforce STOP itself for a
-- standard AU long code outside its paid Advanced Opt-Out add-on, so this
-- has to be handled at the application layer. See
-- supabase/functions/_shared/sms.ts's isStopKeyword/isStartKeyword and
-- incoming-sms-webhook's new STOP/START branch.
--
-- Scoped to (business_id, phone), not phone alone: each business sends
-- from its own twilio_number (or the shared platform fallback), and a
-- client opting out of one business's texts has no bearing on another's
-- — same scoping missed-call-webhook/incoming-sms-webhook already use to
-- attribute an inbound message to a business.
--
-- service_role-only, same minimal pattern as processed_sms_sids
-- (supabase_schema_delta_incoming_sms_webhook.sql) — every touchpoint is
-- an edge function using the service-role key, never a browser.
-- ============================================================

create table if not exists sms_opt_outs (
  business_id uuid references businesses(id) on delete cascade,
  phone       text not null,
  created_at  timestamptz not null default now(),
  primary key (business_id, phone)
);

alter table sms_opt_outs enable row level security;

grant select, insert, delete on sms_opt_outs to service_role;

-- Verify after running: select * from sms_opt_outs limit 1; -- expect: succeeds, empty
