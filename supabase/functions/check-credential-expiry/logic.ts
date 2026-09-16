// Pure threshold-evaluation logic for check-credential-expiry, extracted out
// of index.ts so it can be unit-tested with Vitest (edge functions themselves
// can't be imported into a Node test runner). index.ts imports these same
// functions, so this file IS the production logic, not a reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data/dates.

export interface CredentialThresholds {
  in30: string
  in14: string
  in7: string
  in3: string
  today: string
}

// All dates are YYYY-MM-DD strings (matching the Postgres `date` column
// format), computed relative to `now`, so the >/<= comparisons in
// evaluateCredential can stay simple string comparisons.
export function computeThresholds(now: Date): CredentialThresholds {
  const plusDays = (n: number) => new Date(now.getTime() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return { in30: plusDays(30), in14: plusDays(14), in7: plusDays(7), in3: plusDays(3), today: now.toISOString().slice(0, 10) }
}

export interface CredentialEvalInput {
  expiryDate: string
  warning30SentAt: string | null | undefined
  warning14SentAt: string | null | undefined
  warning7SentAt: string | null | undefined
  hasCurrentJob: boolean
}

export interface CredentialEvalResult {
  should30: boolean
  should14: boolean
  should7: boolean
  urgent: boolean
  expired: boolean
}

// Non-overlapping 30/14/7-day threshold checks (each gated on its own
// "already warned" flag so a credential can't re-fire the same threshold),
// plus a same-day urgent check for expired-or-within-3-days credentials
// belonging to a technician currently on a job.
export function evaluateCredential(input: CredentialEvalInput, thresholds: CredentialThresholds): CredentialEvalResult {
  const { expiryDate, warning30SentAt, warning14SentAt, warning7SentAt, hasCurrentJob } = input
  const { in30, in14, in7, in3, today } = thresholds
  return {
    should30: !warning30SentAt && expiryDate <= in30 && expiryDate > in14,
    should14: !warning14SentAt && expiryDate <= in14 && expiryDate > in7,
    should7: !warning7SentAt && expiryDate <= in7,
    urgent: expiryDate <= in3 && hasCurrentJob,
    expired: expiryDate < today,
  }
}
