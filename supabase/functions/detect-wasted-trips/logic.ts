// Pure detection logic for detect-wasted-trips, extracted out of index.ts
// so it can be unit-tested with Vitest (edge functions themselves can't be
// imported into a Node test runner). index.ts imports these same
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

export interface LocationPing {
  lat: number
  lng: number
}

// True if any of the technician's (already-dwell-filtered) GPS pings fall
// within radiusKm of the client's location — the "were they actually
// there" signal for the wasted-trip check.
export function wasOnSite(pings: LocationPing[], clientLat: number, clientLng: number, radiusKm: number): boolean {
  return pings.some(p => haversineKm(p.lat, p.lng, clientLat, clientLng) <= radiusKm)
}

export interface ScheduledJob {
  business_id: string
  technician_id: string
  scheduled_time: string
}

export interface TechDateGroup {
  businessId: string
  technicianId: string
  date: string
  count: number
}

// Buckets jobs by (technician, calendar date) — the same-day job-overload
// heuristic's input. Jobs are expected to already be filtered to ones with
// both technician_id and scheduled_time set (there's no date to bucket a
// job by otherwise), but this defensively skips any that aren't.
export function groupJobsByTechnicianDate(jobs: ScheduledJob[]): TechDateGroup[] {
  const byTechDate: Record<string, TechDateGroup> = {}
  for (const j of jobs) {
    if (!j.scheduled_time || !j.technician_id) continue
    const date = j.scheduled_time.slice(0, 10)
    const key = `${j.technician_id}|${date}`
    if (!byTechDate[key]) byTechDate[key] = { businessId: j.business_id, technicianId: j.technician_id, date, count: 0 }
    byTechDate[key].count++
  }
  return Object.values(byTechDate)
}

// Filters (technician, date) groups down to ones strictly over the
// threshold — a conservative, fixed-threshold overload signal, not proof of
// any specific double-booked time slot (see index.ts header comment).
export function findOverloadedGroups(groups: TechDateGroup[], threshold: number): TechDateGroup[] {
  return groups.filter(g => g.count > threshold)
}
