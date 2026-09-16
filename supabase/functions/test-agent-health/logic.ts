// Pure stale/error/dedup evaluation logic for test-agent-health, extracted
// out of index.ts so it can be unit-tested with Vitest (edge functions
// themselves can't be imported into a Node test runner). index.ts imports
// this same function, so this file IS the production logic, not a
// reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — this is a
// plain, synchronous, side-effect-free calculation over plain data/dates.

// Buffer multiplier so normal cron jitter / a slightly-late run doesn't
// false-positive — a function is only "stale" once it's overdue by this
// many multiples of its own cadence, with a minimum floor so fast (15min)
// cadences aren't flagged over trivial delays either.
export const STALE_MULTIPLIER = 3
export const STALE_FLOOR_MINUTES = 30
export const ERROR_COUNT_THRESHOLD = 5

export interface FunctionHealthInput {
  lastRunAt: string | null | undefined
  errorCount: number | null | undefined
  lastHealthAlertAt: string | null | undefined
  cadenceMinutes: number | undefined
}

export interface FunctionHealthResult {
  isStale: boolean
  isErrorHeavy: boolean
  unhealthy: boolean
  // Dedup: only alert if we've never alerted before, or the function has
  // run again since our last alert (a "new" occurrence of the unhealthy
  // condition, not the same unresolved one we already flagged).
  situationChanged: boolean
  shouldAlert: boolean
  reasons: string[]
}

export function evaluateFunctionHealth(input: FunctionHealthInput, now: number = Date.now()): FunctionHealthResult {
  const { lastRunAt, errorCount, lastHealthAlertAt, cadenceMinutes } = input
  const lastRunMs = lastRunAt ? new Date(lastRunAt).getTime() : null

  let isStale = false
  if (cadenceMinutes) {
    const staleThresholdMs = Math.max(cadenceMinutes * STALE_MULTIPLIER, STALE_FLOOR_MINUTES) * 60 * 1000
    isStale = lastRunMs === null || (now - lastRunMs) > staleThresholdMs
  }

  const isErrorHeavy = (errorCount ?? 0) >= ERROR_COUNT_THRESHOLD
  const unhealthy = isStale || isErrorHeavy

  const lastAlertMs = lastHealthAlertAt ? new Date(lastHealthAlertAt).getTime() : null
  const situationChanged = lastAlertMs === null || (lastRunMs !== null && lastRunMs > lastAlertMs)
  const shouldAlert = unhealthy && situationChanged

  const reasons: string[] = []
  if (isStale) {
    reasons.push(lastRunMs === null
      ? 'has never recorded a run'
      : `last ran ${Math.round((now - lastRunMs) / 60000)} min ago (expected every ${cadenceMinutes} min)`)
  }
  if (isErrorHeavy) reasons.push(`error_count=${errorCount} (threshold ${ERROR_COUNT_THRESHOLD})`)

  return { isStale, isErrorHeavy, unhealthy, situationChanged, shouldAlert, reasons }
}
