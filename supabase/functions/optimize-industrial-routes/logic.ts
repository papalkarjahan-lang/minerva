// Pure nearest-asset logic for optimize-industrial-routes, extracted out of
// index.ts so it can be unit-tested with Vitest (edge functions themselves
// can't be imported into a Node test runner). index.ts imports this same
// function, so this file IS the production logic, not a reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — this is a
// plain, synchronous, side-effect-free calculation over plain data.

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface AssetCandidate {
  id: string
  name?: string | null
  current_lat: number | null
  current_lng: number | null
}

// Finds the nearest candidate to (siteLat, siteLng), skipping any candidate
// (or the site itself) missing coordinates. Returns null if no candidate
// has usable coordinates.
export function findNearestAsset<T extends AssetCandidate>(
  candidates: T[],
  siteLat: number | null,
  siteLng: number | null
): { asset: T; distanceMeters: number } | null {
  if (siteLat == null || siteLng == null) return null
  let best: T | null = null
  let bestDist = Infinity
  for (const a of candidates) {
    if (a.current_lat == null || a.current_lng == null) continue
    const d = haversineMeters(a.current_lat, a.current_lng, siteLat, siteLng)
    if (d < bestDist) { bestDist = d; best = a }
  }
  return best ? { asset: best, distanceMeters: bestDist } : null
}
