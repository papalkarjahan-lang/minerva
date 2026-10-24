// Pure logic for check-service-credentials, extracted so it can be unit
// tested with Vitest. index.ts imports this same file, so this IS the
// production logic, not a reimplementation.

export interface ServiceCheckResult {
  service: string
  healthy: boolean
  detail: string
}

// Twilio's account-status endpoint (GET /Accounts/{Sid}.json) returns
// status: 'active' | 'suspended' | 'closed'. A suspended/closed account
// means every SMS send will fail even though TWILIO_ACCOUNT_SID/
// TWILIO_AUTH_TOKEN are both genuinely "set" — the exact gap a presence-
// only check can't catch, and the exact failure mode found live 2026-10-24
// (trial expired 2026-09-18, never upgraded, silent for 5+ weeks because
// every SMS-sending function treats a failed send as a handled, non-
// throwing outcome, not an agent-health error).
export function classifyTwilioAccountStatus(httpOk: boolean, accountStatus: string | null): ServiceCheckResult {
  if (!httpOk) {
    return { service: 'twilio', healthy: false, detail: 'Twilio API call failed — credentials are likely invalid, or the account is unreachable.' }
  }
  if (accountStatus !== 'active') {
    return { service: 'twilio', healthy: false, detail: `Twilio account status is "${accountStatus || 'unknown'}", not "active" — every SMS send will silently fail.` }
  }
  return { service: 'twilio', healthy: true, detail: 'Twilio account is active.' }
}

// Builds the TWILIO_PHONE_NUMBER alert detail — and, when the Twilio
// account is itself healthy, looks up whether a real number is already
// sitting purchased on the account (via a free, read-only call to
// /IncomingPhoneNumbers.json) so the alert can say "set it to +61..."
// instead of just "go buy one" when a number may already exist and
// simply never got wired into Supabase secrets.
export function describePhoneNumberGap(twilioAccountHealthy: boolean, existingNumbers: string[]): string {
  if (!twilioAccountHealthy) {
    return 'TWILIO_PHONE_NUMBER not set — even a fully working Twilio account has no "From" number to send with.'
  }
  if (existingNumbers.length === 0) {
    return 'TWILIO_PHONE_NUMBER not set, and no phone number is purchased on this Twilio account yet — buy one in the Twilio Console, then set the secret to it.'
  }
  const list = existingNumbers.slice(0, 3).join(', ') + (existingNumbers.length > 3 ? `, +${existingNumbers.length - 3} more` : '')
  return `TWILIO_PHONE_NUMBER not set, but this Twilio account already has a real number purchased (${list}) — just set the secret to it, no need to buy a new one.`
}

// Only alert on a TRANSITION into an unhealthy state (including the very
// first check ever, if it's already unhealthy) — not on every subsequent
// daily run for an already-known, not-yet-fixed problem. The whole point
// of this function is catching a NEW silent failure quickly, not becoming
// daily noise for something already being worked on. previousInsightType
// is the most recent prior row's insight_type for this service ('
// service_health_ok' | 'service_health_alert'), or null if none exists yet.
export function shouldAlert(previousInsightType: string | null, currentlyHealthy: boolean): boolean {
  if (currentlyHealthy) return false
  return previousInsightType !== 'service_health_alert'
}
