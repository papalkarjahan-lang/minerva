// Pure decision logic for auto-assign-technician, extracted out of index.ts
// so it can be unit-tested with Vitest (edge functions themselves can't be
// imported into a Node test runner — they call Deno.serve/Deno.env and
// import from deno.land/esm.sh URLs). index.ts imports these same functions,
// so this file IS the production logic, not a reimplementation of it.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data, which is what makes it safely testable without a database.

export const EMERGENCY_TIEBREAK_KM = 2
export const FATIGUE_BASELINE_HOURS = 40
export const FATIGUE_TIEBREAK_KM_PER_HOUR = 0.15

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

export interface TechnicianCandidate {
  id: string
  name?: string | null
  current_lat: number | null
  current_lng: number | null
  rolling_emergency_job_count?: number | null
  rolling_week_hours?: number | null
}

export interface SubcontractorCandidate {
  id: string
  name?: string | null
  current_lat: number | null
  current_lng: number | null
}

// Hard-exclude technicians who don't hold a currently-valid required
// credential — see index.ts header comment for the compliance rationale.
export function filterQualifiedTechnicians<T extends { id: string }>(free: T[], qualifiedIds: Set<string>): T[] {
  return free.filter(t => qualifiedIds.has(t.id))
}

// Nearest-by-distance PLUS soft emergency/fatigue tiebreak penalties (never
// hard-excludes — a genuinely much-closer technician still wins). Mirrors
// the loop that used to live inline in index.ts exactly.
export function pickNearestTechnician(
  candidates: TechnicianCandidate[],
  jobLat: number | null,
  jobLng: number | null
): { nearest: TechnicianCandidate | null; nearestDist: number | null } {
  if (candidates.length === 0) return { nearest: null, nearestDist: null }
  let nearest = candidates[0]
  let nearestDist: number | null = null
  if (jobLat != null && jobLng != null) {
    let bestScore = Infinity
    for (const t of candidates) {
      const d = haversineKm(jobLat, jobLng, t.current_lat as number, t.current_lng as number)
      const fatigueHoursOverBaseline = Math.max(0, (t.rolling_week_hours || 0) - FATIGUE_BASELINE_HOURS)
      const score = d
        + (t.rolling_emergency_job_count || 0) * EMERGENCY_TIEBREAK_KM
        + fatigueHoursOverBaseline * FATIGUE_TIEBREAK_KM_PER_HOUR
      if (score < bestScore) { bestScore = score; nearest = t; nearestDist = d }
    }
  }
  return { nearest, nearestDist }
}

// Same nearest-by-distance selection for the subcontractor fallback pool —
// no emergency/fatigue tiebreak, since those columns don't apply to
// non-employees.
export function pickNearestSubcontractor(
  subs: SubcontractorCandidate[],
  jobLat: number | null,
  jobLng: number | null
): { nearest: SubcontractorCandidate | null; nearestDist: number | null } {
  if (subs.length === 0) return { nearest: null, nearestDist: null }
  let nearest = subs[0]
  let nearestDist: number | null = null
  if (jobLat != null && jobLng != null) {
    let bestDist = Infinity
    for (const s of subs) {
      const d = haversineKm(jobLat, jobLng, s.current_lat as number, s.current_lng as number)
      if (d < bestDist) { bestDist = d; nearest = s }
    }
    nearestDist = bestDist
  }
  return { nearest, nearestDist }
}

export function isBeyondMaxKm(maxKm: number | null | undefined, dist: number | null): boolean {
  return maxKm != null && dist != null && dist > maxKm
}
