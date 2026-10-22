// Pure date-window logic for send-appointment-reminder-sms, extracted out
// of index.ts so it can be unit-tested with Vitest. index.ts imports this
// same file, so this IS the production logic, not a reimplementation.
//
// addLocalDays/localOffsetMinutes/localMidnightUTC are duplicated from
// check-weather-risk/logic.ts rather than imported across function
// directories — no precedent for that in this repo (every cross-function
// import goes through _shared/), and this is small, stable, dependency-free
// timezone arithmetic, same duplication tradeoff send-job-referral-code-
// sms/logic.ts already made for its own alphabet/code-generation logic.

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
