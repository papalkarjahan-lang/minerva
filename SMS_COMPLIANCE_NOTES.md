# Minerva — SMS Compliance Notes

Started 2026-10-25, same spirit as `SECURITY_NOTES.md` / `BILLING_INTEGRITY_NOTES.md`
/ `OUTREACH_INTEGRITY_NOTES.md` / `RECORD_KEEPING_NOTES.md` — a dated, honest
record of what's been checked, fixed, and deliberately deferred, specifically
around the client-facing product SMS this app sends on a business's behalf
(ETA, completion, invoice, quote, referral code, job cancelled/rescheduled,
appointment reminder, review request). Not the outreach/prospecting pipeline
— that's `OUTREACH_INTEGRITY_NOTES.md`'s scope (`outreach_prospects`,
`outreach-unsubscribe`), and it already had its own unsubscribe handling
fixed on 2026-10-10. This is the other half: a Minerva *customer's own
client*, not a prospect Minerva itself is courting.

## Fixed 2026-10-25: no way for a client to opt out of a business's SMS

Every client-facing SMS this product sends either explicitly invites a
reply ("Reply here if...") or is the kind of notification a real person
would reasonably reply to — and `send-appointment-reminder-sms` in
particular texts the same client again for every future job, not just
once. Despite that, nothing anywhere recognized a reply of "STOP" (or any
of the other standard carrier opt-out keywords — STOPALL, UNSUBSCRIBE,
CANCEL, END, QUIT) as anything other than ordinary text:
`incoming-sms-webhook` logged it as a job note and a Slack ping, same as
"running late, 10 min." A client who texted STOP expecting it to work
would silently keep receiving every future SMS from that business.

This isn't guaranteed to be covered by Twilio or the carrier automatically
— Twilio's Advanced Opt-Out (automatic STOP/START handling) is a paid
add-on, not the default for a standard AU long code, so a business running
on a bare Twilio number has no safety net here unless the application
handles it itself.

**Fix**, built end to end:
- `supabase_schema_delta_sms_opt_out.sql` — new `sms_opt_outs` table,
  scoped to `(business_id, phone)` (a client opting out of one business's
  texts has no bearing on another's), service_role-only, same minimal
  pattern as `processed_sms_sids`.
- `_shared/sms.ts` — `isStopKeyword`/`isStartKeyword` (pure, unit tested in
  `sms.test.ts`): matches the standard keyword lists case-insensitively,
  tolerant of punctuation/whitespace, and deliberately does NOT match a
  keyword embedded in an ordinary sentence ("don't stop the quote" stays
  ordinary text).
- `incoming-sms-webhook` — checks STOP/START before the generic reply-
  logging branch; writes/deletes the `sms_opt_outs` row and sends a one-
  time confirmation SMS (the one deliberate exception to this function's
  own "no auto-reply" rule — silence is the wrong default here, a client
  needs to know the stop/restart actually took effect).
- `_shared/smsOptOut.ts` (`isOptedOutOfSms`) — checked before every
  client-facing send: `send-eta-sms`, `send-completion-sms`,
  `send-invoice-sms`, `send-review-request-sms`, `send-quote-sms`,
  `send-weather-reschedule-sms`, `send-referral-code-sms`,
  `send-job-referral-code-sms`, `send-job-cancelled-sms` (client leg
  only — the technician leg of the same function is unaffected, staff
  can't opt out of being told about their own job),
  `send-job-rescheduled-sms` (same), `send-appointment-reminder-sms`
  (the repeat-sender, so the most important one to get right).
- Deliberately NOT applied to technician/staff-facing sends
  (`send-job-assignment-sms`, `send-setup-sms`) — opt-out is a
  client/consumer concept, not something a business's own employee can
  invoke against their employer's operational texts.
- A skipped send due to opt-out is never recorded as a *failure* —
  `referral_sms_failed`/equivalent flags are explicitly cleared, not set,
  so an opted-out client doesn't sit on a dispatcher's "needs resend" list
  forever for something that was never going to send.

**Still manual, not yet verified end-to-end against a live Twilio
account**: this requires `TWILIO_PHONE_NUMBER`/`TWILIO_ACCOUNT_SID` to
actually be configured to test against a real inbound STOP (see
`minerva_launch_sequencing_plan` memory / `check-service-credentials` for
current Twilio status). The logic itself (keyword matching, the DB
read/write shape, the skip points in every sender) is unit-tested and
code-reviewed, but a real end-to-end "text STOP, confirm no more texts
arrive" run hasn't happened and can't until Twilio is fully live.

**Scope note, honestly stated**: this is a product/consumer-experience
fix (a client who asks to stop getting texts should have that actually
work), not a legal compliance determination. Whether any particular one of
these message types is a "commercial electronic message" under Australia's
Spam Act 2003, or falls under a factual/transactional exemption because
it relates to a transaction the client already engaged in, is a question
for the business owner's own legal judgment — not something this session
is positioned to rule on. Building the opt-out mechanism is worth doing
regardless of where that line falls, since "a client's own STOP request
is silently ignored" is a bad outcome either way.
