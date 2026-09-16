// Pure carbon-estimate calculation logic for estimate-job-carbon, extracted
// out of index.ts so it can be unit-tested with Vitest (edge functions
// themselves can't be imported into a Node test runner). index.ts imports
// these same functions, so this file IS the production logic, not a
// reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data.

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface CarbonJobStop {
  client_lat: number
  client_lng: number
}

// Sums haversine distance between each consecutive pair of stops, in the
// order given (callers are expected to pass stops already ordered by
// completed_at — this function doesn't sort).
export function totalChainedKm(stops: CarbonJobStop[]): number {
  let totalKm = 0
  for (let i = 1; i < stops.length; i++) {
    totalKm += haversineKm(stops[i - 1].client_lat, stops[i - 1].client_lng, stops[i].client_lat, stops[i].client_lng)
  }
  return totalKm
}

export interface CarbonEstimate {
  distanceKm: number
  estimatedKgCo2e: number
}

// Returns null when there's nothing meaningful to record — fewer than 2
// stops (no transit distance exists) or zero distance (e.g. duplicate
// coordinates) — mirroring index.ts's existing skip conditions exactly.
export function computeCarbonEstimate(stops: CarbonJobStop[], factorKgPerKm: number): CarbonEstimate | null {
  if (stops.length < 2) return null
  const totalKm = totalChainedKm(stops)
  if (totalKm <= 0) return null
  const estimatedKg = totalKm * factorKgPerKm
  return {
    distanceKm: Math.round(totalKm * 100) / 100,
    estimatedKgCo2e: Math.round(estimatedKg * 100) / 100,
  }
}
