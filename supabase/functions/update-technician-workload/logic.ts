// Pure rolling-hours/burnout logic for update-technician-workload, extracted
// out of index.ts so it can be unit-tested with Vitest (edge functions
// themselves can't be imported into a Node test runner). index.ts imports
// these same functions, so this file IS the production logic, not a
// reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data/dates.

export const BURNOUT_HOURS_THRESHOLD = 55 // hours in the trailing 7 days
export const RE_ALERT_DAYS = 7

export interface LocationBreadcrumb {
  recorded_at: string
}

// Buckets breadcrumbs by calendar day (UTC, via the recorded_at date
// prefix) and sums (latest - earliest) per day, in hours, rounded to 1
// decimal place — matching index.ts's existing behaviour exactly.
export function computeRollingWeekHours(locations: LocationBreadcrumb[]): number {
  const byDay: Record<string, { min: number; max: number }> = {}
  for (const loc of locations) {
    const t = new Date(loc.recorded_at).getTime()
    const day = loc.recorded_at.slice(0, 10)
    if (!byDay[day]) byDay[day] = { min: t, max: t }
    else { byDay[day].min = Math.min(byDay[day].min, t); byDay[day].max = Math.max(byDay[day].max, t) }
  }
  let totalHours = 0
  for (const day in byDay) {
    totalHours += (byDay[day].max - byDay[day].min) / (1000 * 60 * 60)
  }
  return Math.round(totalHours * 10) / 10
}

// A burnout alert fires when the rolling total meets the threshold AND the
// technician hasn't already been flagged within the last RE_ALERT_DAYS days.
export function shouldFlagBurnout(totalHours: number, burnoutFlagSentAt: string | null | undefined, now: number = Date.now()): boolean {
  const alreadyFlaggedRecently = !!burnoutFlagSentAt
    && (now - new Date(burnoutFlagSentAt).getTime()) < RE_ALERT_DAYS * 24 * 60 * 60 * 1000
  return totalHours >= BURNOUT_HOURS_THRESHOLD && !alreadyFlaggedRecently
}
