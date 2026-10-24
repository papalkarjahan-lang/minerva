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
