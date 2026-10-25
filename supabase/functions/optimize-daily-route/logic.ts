// Pure route-planning logic for optimize-daily-route, extracted out of
// index.ts so it can be unit-tested with Vitest (edge functions themselves
// can't be imported into a Node test runner). index.ts imports these same
// functions, so this file IS the production logic, not a reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data.

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface RouteJob {
  id: string
  client_lat: number
  client_lng: number
}

export interface RouteStop {
  id: string
  distanceKm: number
  sequence: number
  estimatedArrival: string
}

// Nearest-neighbor chain from the technician's current position, then
// chains estimated arrival times using avgSpeedKmh travel + a fixed
// per-stop dwell time. See index.ts header comment for the honest caveat
// on both the nearest-neighbor heuristic and the fixed-speed assumption.
export function planRoute(
  startLat: number,
  startLng: number,
  jobs: RouteJob[],
  startTime: Date,
  avgSpeedKmh: number,
  stopMinutes: number
): RouteStop[] {
  const unvisited = [...jobs]
  let currentLat = startLat
  let currentLng = startLng
  let cursor = new Date(startTime)
  const stops: RouteStop[] = []

  while (unvisited.length > 0) {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < unvisited.length; i++) {
      const d = haversineKm(currentLat, currentLng, unvisited[i].client_lat, unvisited[i].client_lng)
      if (d < bestDist) { bestDist = d; bestIdx = i }
    }
    const next = unvisited.splice(bestIdx, 1)[0]

    const travelMinutes = avgSpeedKmh > 0 ? (bestDist / avgSpeedKmh) * 60 : 0
    cursor = new Date(cursor.getTime() + travelMinutes * 60000)
    const estimatedArrival = cursor.toISOString()
    cursor = new Date(cursor.getTime() + stopMinutes * 60000)

    stops.push({ id: next.id, distanceKm: bestDist, sequence: stops.length + 1, estimatedArrival })
    currentLat = next.client_lat
    currentLng = next.client_lng
  }

  return stops
}

// Local-day-boundary helpers — duplicated from check-weather-risk/logic.ts
// (same tradeoff send-appointment-reminder-sms/logic.ts already made for
// its own copy: small, stable, dependency-free timezone arithmetic, no
// precedent in this repo for a cross-function-directory import outside
// _shared/).
//
// Found 2026-10-25: index.ts previously defaulted `targetDate` to
// `new Date().toISOString().slice(0, 10)` (the server's own UTC date) and
// built `dayStart`/`dayEnd` as naive `${targetDate}T00:00:00` strings — no
// timezone suffix, so Postgres interprets them in the DB session's
// timezone (UTC) when comparing against `jobs.scheduled_time`, which is a
// genuine, correctly-timezone-aware `timestamptz` (DispatcherView.jsx's
// own job-creation code already converts the dispatcher's local
// datetime-local input to true UTC via `new Date(...).toISOString()` — see
// its own comment on this exact class of bug). Sydney is UTC+10/+11, so
// UTC midnight falls at 10-11am local time — squarely mid-morning for a
// trade business — meaning a dispatcher clicking "Optimize" anytime before
// ~11am Sydney time got a query window shifted most of a day early:
// roughly yesterday-afternoon-through-this-morning instead of today, for
// the single most natural time of day to use a "plan today's route" tool.
export function addLocalDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

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

export function localMidnightUTC(ymd: string, timeZone: string): Date {
  const guess = new Date(`${ymd}T00:00:00Z`)
  const offsetMin = localOffsetMinutes(guess, timeZone)
  return new Date(guess.getTime() - offsetMin * 60000)
}
