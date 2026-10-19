// Pure fleet-assignment + route-planning logic for optimize-fleet-day,
// extracted out of index.ts so it can be unit-tested with Vitest — same
// convention as every other optimize-*/logic.ts in this project.
// haversineKm is intentionally duplicated here rather than imported
// across function directories: no shared _shared/geo.ts exists, and this
// project's established pattern (optimize-daily-route/logic.ts,
// detect-wasted-trips/logic.ts, auto-assign-technician/logic.ts, etc.) is
// a small duplicated copy per function, not a cross-function import.

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

export interface FleetTechnician {
  id: string
  current_lat: number
  current_lng: number
}

export interface FleetJob {
  id: string
  client_lat: number
  client_lng: number
  technician_id: string | null
  route_sequence?: number | null
  scheduled_time?: string | null
}

export interface FleetStop {
  id: string
  sequence: number
  estimatedArrival: string
  distanceKm: number
}

// HONESTY NOTE on method: a greedy nearest-pair assignment across the
// whole business, not a true solver for the (NP-hard) vehicle-routing
// problem — same honesty convention as optimize-daily-route's own header
// comment, applied to WHICH technician gets WHICH job instead of just the
// order within one technician's existing list. Repeatedly picks the
// single cheapest remaining (technician, job) pair by straight-line
// distance from that technician's current position (or their
// most-recently-assigned job's position, once they have one), assigns
// it, and keeps going until every job has a technician. This tends to
// land close to a good allocation for realistic same-day job counts, but
// is not guaranteed optimal — a true solver could occasionally do better.
export function greedyAssignJobs(
  technicians: FleetTechnician[],
  jobs: FleetJob[]
): Map<string, string[]> {
  const assignment = new Map<string, string[]>()
  const techPos = new Map<string, { lat: number; lng: number }>()
  for (const t of technicians) {
    assignment.set(t.id, [])
    techPos.set(t.id, { lat: t.current_lat, lng: t.current_lng })
  }

  const unassigned = [...jobs]
  while (unassigned.length > 0) {
    let bestTechId: string | null = null
    let bestJobIdx = -1
    let bestDist = Infinity
    for (let ji = 0; ji < unassigned.length; ji++) {
      const job = unassigned[ji]
      for (const t of technicians) {
        const pos = techPos.get(t.id)!
        const d = haversineKm(pos.lat, pos.lng, job.client_lat, job.client_lng)
        if (d < bestDist) { bestDist = d; bestTechId = t.id; bestJobIdx = ji }
      }
    }
    const job = unassigned.splice(bestJobIdx, 1)[0]
    assignment.get(bestTechId!)!.push(job.id)
    techPos.set(bestTechId!, { lat: job.client_lat, lng: job.client_lng })
  }

  return assignment
}

// 2-opt local search over a nearest-neighbor-ish starting order — a
// standard improvement pass (reverses any segment that shortens the total
// route) that fixes the "crossing path" inefficiency a purely greedy order
// is prone to. Still a heuristic, not a guaranteed-optimal TSP solve, but
// every swap it makes is a strict improvement, so the result is never
// worse than what it started from. Bounded to MAX_TWO_OPT_PASSES full
// sweeps so a pathological input can't run away — a realistic same-day
// stop count (a handful to a couple dozen) converges in far fewer passes.
const MAX_TWO_OPT_PASSES = 25

export function twoOptImprove(
  startLat: number,
  startLng: number,
  jobs: FleetJob[]
): FleetJob[] {
  if (jobs.length < 3) return jobs
  const route = [...jobs]

  const routeDistance = (order: FleetJob[]): number => {
    let total = haversineKm(startLat, startLng, order[0].client_lat, order[0].client_lng)
    for (let i = 0; i < order.length - 1; i++) {
      total += haversineKm(order[i].client_lat, order[i].client_lng, order[i + 1].client_lat, order[i + 1].client_lng)
    }
    return total
  }

  let improved = true
  let passes = 0
  while (improved && passes < MAX_TWO_OPT_PASSES) {
    improved = false
    passes++
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)]
        if (routeDistance(candidate) < routeDistance(route) - 1e-9) {
          route.splice(0, route.length, ...candidate)
          improved = true
        }
      }
    }
  }
  return route
}

// Chains sequence numbers + estimated arrival times over an already-
// ordered job list — same fixed-speed/fixed-dwell-time assumptions as
// optimize-daily-route's planRoute (see that function's header for the
// honest caveat, which applies identically here).
export function chainEtas(
  startLat: number,
  startLng: number,
  orderedJobs: FleetJob[],
  startTime: Date,
  avgSpeedKmh: number,
  stopMinutes: number
): FleetStop[] {
  let currentLat = startLat
  let currentLng = startLng
  let cursor = new Date(startTime)
  const stops: FleetStop[] = []
  for (const job of orderedJobs) {
    const d = haversineKm(currentLat, currentLng, job.client_lat, job.client_lng)
    const travelMinutes = avgSpeedKmh > 0 ? (d / avgSpeedKmh) * 60 : 0
    cursor = new Date(cursor.getTime() + travelMinutes * 60000)
    stops.push({ id: job.id, sequence: stops.length + 1, estimatedArrival: cursor.toISOString(), distanceKm: d })
    cursor = new Date(cursor.getTime() + stopMinutes * 60000)
    currentLat = job.client_lat
    currentLng = job.client_lng
  }
  return stops
}

// HONESTY NOTE on method: a bounded local search on top of
// greedyAssignJobs's output, not a true assignment solver (a real
// Hungarian-algorithm/auction solve is the next step up if this stops
// being enough — see minerva_efficiency_pivot memory). Looks at every
// pair of technicians and every pair of jobs currently split between
// them, and asks: if these two jobs swapped owners, would the combined
// route cost of BOTH technicians go down? Route cost for a candidate is
// computed with the same twoOptImprove this file already uses, so a
// swap is judged on the actual reordered route, not the raw job list.
// Only ever accepts a swap that's a strict improvement (never worse,
// same guarantee twoOptImprove already makes for route order) — if no
// swap improves anything, the greedy assignment is returned unchanged.
// Bounded to MAX_SWAP_PASSES full restarts so a pathological input
// can't run away; a realistic same-day fleet (a handful of technicians,
// a couple dozen jobs) converges in far fewer.
const MAX_SWAP_PASSES = 10

export function swapImproveAssignment(
  technicians: FleetTechnician[],
  jobs: FleetJob[],
  assignment: Map<string, string[]>
): Map<string, string[]> {
  const jobsById = new Map(jobs.map(j => [j.id, j]))
  const techById = new Map(technicians.map(t => [t.id, t]))
  const current = new Map<string, string[]>()
  for (const [techId, jobIds] of assignment) current.set(techId, [...jobIds])

  const routeCost = (tech: FleetTechnician, jobIds: string[]): number => {
    const theirJobs = jobIds.map(id => jobsById.get(id)).filter((j): j is FleetJob => !!j)
    const ordered = twoOptImprove(tech.current_lat, tech.current_lng, theirJobs)
    let total = 0
    let lat = tech.current_lat
    let lng = tech.current_lng
    for (const j of ordered) {
      total += haversineKm(lat, lng, j.client_lat, j.client_lng)
      lat = j.client_lat
      lng = j.client_lng
    }
    return total
  }

  const techIds = [...current.keys()]
  let improved = true
  let passes = 0
  while (improved && passes < MAX_SWAP_PASSES) {
    improved = false
    passes++
    outer:
    for (let a = 0; a < techIds.length; a++) {
      for (let b = a + 1; b < techIds.length; b++) {
        const techA = techById.get(techIds[a])
        const techB = techById.get(techIds[b])
        if (!techA || !techB) continue
        const listA = current.get(techIds[a])!
        const listB = current.get(techIds[b])!
        if (listA.length === 0 || listB.length === 0) continue
        const baseCost = routeCost(techA, listA) + routeCost(techB, listB)
        for (let i = 0; i < listA.length; i++) {
          for (let j = 0; j < listB.length; j++) {
            const candidateA = listA.slice(); candidateA[i] = listB[j]
            const candidateB = listB.slice(); candidateB[j] = listA[i]
            const candidateCost = routeCost(techA, candidateA) + routeCost(techB, candidateB)
            if (candidateCost < baseCost - 1e-9) {
              current.set(techIds[a], candidateA)
              current.set(techIds[b], candidateB)
              improved = true
              break outer
            }
          }
        }
      }
    }
  }
  return current
}

// Total distance of a business's CURRENT real assignment+order — the
// honest baseline optimize-fleet-day compares its proposed plan against
// (see index.ts: never claim savings against a strawman, only against
// what would actually happen today without this click). Groups jobs by
// their existing technician_id, orders each tech's jobs by their existing
// route_sequence if set (else scheduled_time), and chains distance from
// that tech's current position.
export function currentPlanDistanceKm(
  technicians: FleetTechnician[],
  jobs: FleetJob[]
): number {
  let total = 0
  for (const t of technicians) {
    const own = jobs
      .filter(j => j.technician_id === t.id)
      .sort((a, b) => {
        if (a.route_sequence != null && b.route_sequence != null) return a.route_sequence - b.route_sequence
        if (a.scheduled_time && b.scheduled_time) return a.scheduled_time.localeCompare(b.scheduled_time)
        return 0
      })
    let lat = t.current_lat
    let lng = t.current_lng
    for (const job of own) {
      total += haversineKm(lat, lng, job.client_lat, job.client_lng)
      lat = job.client_lat
      lng = job.client_lng
    }
  }
  return total
}
