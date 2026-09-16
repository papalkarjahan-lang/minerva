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
