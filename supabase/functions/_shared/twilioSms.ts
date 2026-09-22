// Shared Twilio SMS-send helper used by nurture-stale-leads,
// winback-lost-leads, and retention-checkin — the exact same "send one SMS
// via Twilio, return whether it succeeded" logic was duplicated
// byte-for-byte (or near enough) across these three autonomous cron
// functions. Consolidated here to remove that drift risk.
//
// Unlike every other file in _shared/, this one does real network I/O (a
// live fetch to Twilio) rather than pure computation, so it isn't unit
// tested with Vitest — there's nothing meaningful to assert without
// mocking Twilio itself, and every call site already treats a failed send
// as best-effort (logs and returns false, never throws).
import { formatAuPhone } from "./sms.ts"

export interface TwilioCreds {
  sid?: string
  token?: string
  from?: string
}

export async function sendTwilioSms(
  twilio: TwilioCreds,
  rawPhone: string,
  message: string,
  logPrefix: string
): Promise<boolean> {
  if (!twilio.sid || !twilio.token || !twilio.from) return false

  const phone = formatAuPhone(rawPhone)

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${twilio.sid}:${twilio.token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: twilio.from, Body: message }).toString(),
  }).catch(err => { console.error(`${logPrefix}: SMS failed`, err); return null })

  if (!res) return false
  const result = await res.json().catch(() => ({}))
  return !result.error_code
}
