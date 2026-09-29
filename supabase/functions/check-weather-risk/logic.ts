// Pure weather-risk threshold logic for check-weather-risk, extracted out of
// index.ts so it can be unit-tested with Vitest (edge functions themselves
// can't be imported into a Node test runner). index.ts imports this same
// function, so this file IS the production logic, not a reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports, no fetch) on purpose —
// this is a plain, synchronous, side-effect-free calculation over a
// forecast object.

export const RAIN_PROB_THRESHOLD = 70 // %
export const WIND_THRESHOLD_KMH = 60
export const HEAT_THRESHOLD_C = 40

export interface Forecast {
  rainProb: number
  windKmh: number
  maxTempC: number
}

export interface RiskEvaluation {
  risky: boolean
  reasons: string[]
}

// Evaluates a single day's forecast against the three independent risk
// thresholds (rain probability, wind speed, extreme heat) — any one of
// them being met makes the job risky, and each met threshold contributes
// its own human-readable reason to the summary.
export function evaluateForecastRisk(forecast: Forecast): RiskEvaluation {
  const reasons: string[] = []
  if (forecast.rainProb >= RAIN_PROB_THRESHOLD) reasons.push(`${forecast.rainProb}% chance of rain`)
  if (forecast.windKmh >= WIND_THRESHOLD_KMH) reasons.push(`wind up to ${Math.round(forecast.windKmh)} km/h`)
  if (forecast.maxTempC >= HEAT_THRESHOLD_C) reasons.push(`forecast high of ${Math.round(forecast.maxTempC)}°C`)
  return { risky: reasons.length > 0, reasons }
}

// "Tomorrow" here must mean the business's local (Australia/Sydney)
// calendar day, not whatever UTC calendar date the cron happens to fire in
// (fixed 2026-09-29). This cron fires at 20:00 UTC — ~6-7am AEST/AEDT — at
// which point new Date().getUTCDate() is still YESTERDAY's UTC date. A
// naive `tomorrow = setUTCDate(+1)` window therefore computed roughly
// [today 10am, tomorrow 10am) in local time instead of the full local
// tomorrow, silently giving only a few hours' notice for the majority of a
// day's afternoon/evening jobs instead of the ~1 day of lead time this
// feature is supposed to provide.
//
// addLocalDays/localOffsetMinutes are the two small dependency-free pieces
// needed to compute the real UTC instant of Sydney local midnight for a
// given calendar day, kept here (not inline in index.ts) so they're
// unit-testable without a live Deno/Intl-in-edge-runtime environment.

// Adds `days` to a 'YYYY-MM-DD' string using pure calendar arithmetic
// (UTC-anchored so this never depends on the host's own timezone).
export function addLocalDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

// The IANA timezone's offset from UTC, in minutes, at the instant nearest
// to `date` — e.g. +660 for AEDT, +600 for AEST. Works by formatting `date`
// in the target timezone, then treating those wall-clock components AS IF
// they were UTC to see how far they drifted from the real UTC instant.
export function localOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const parts: Record<string, string> = {}
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return Math.round((asUtc - date.getTime()) / 60000)
}

// The real UTC instant of local midnight (start of day) for the given
// 'YYYY-MM-DD' calendar date in `timeZone`.
export function localMidnightUTC(ymd: string, timeZone: string): Date {
  const guess = new Date(`${ymd}T00:00:00Z`)
  const offsetMin = localOffsetMinutes(guess, timeZone)
  return new Date(guess.getTime() - offsetMin * 60000)
}
