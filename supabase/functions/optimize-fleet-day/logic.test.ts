import { describe, it, expect } from 'vitest'
import { haversineKm, greedyAssignJobs, swapImproveAssignment, relocateImproveAssignment, twoOptImprove, chainEtas, currentPlanDistanceKm, addLocalDays, localOffsetMinutes, localMidnightUTC } from './logic'

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(-33.87, 151.21, -33.87, 151.21)).toBe(0)
  })
})

describe('greedyAssignJobs', () => {
  it('returns an empty array for every technician when there are no jobs', () => {
    const techs = [{ id: 't1', current_lat: -33.87, current_lng: 151.21 }]
    const result = greedyAssignJobs(techs, [])
    expect(result.get('t1')).toEqual([])
  })

  it('gives each job to the technician actually closest to it, not insertion order', () => {
    // t1 starts in the north, t2 starts in the south. jobA is near t2,
    // jobB is near t1 — a naive "first technician" assignment would get
    // this backwards.
    const techs = [
      { id: 't1', current_lat: -33.80, current_lng: 151.21 }, // north
      { id: 't2', current_lat: -34.50, current_lng: 151.21 }, // south
    ]
    const jobs = [
      { id: 'jobA', client_lat: -34.48, client_lng: 151.21, technician_id: null }, // near t2
      { id: 'jobB', client_lat: -33.82, client_lng: 151.21, technician_id: null }, // near t1
    ]
    const result = greedyAssignJobs(techs, jobs)
    expect(result.get('t1')).toEqual(['jobB'])
    expect(result.get('t2')).toEqual(['jobA'])
  })

  it('assigns every job exactly once even when jobs outnumber technicians', () => {
    const techs = [{ id: 't1', current_lat: -33.87, current_lng: 151.21 }]
    const jobs = [
      { id: 'a', client_lat: -33.88, client_lng: 151.21, technician_id: null },
      { id: 'b', client_lat: -33.90, client_lng: 151.22, technician_id: 't1' },
      { id: 'c', client_lat: -33.92, client_lng: 151.23, technician_id: null },
    ]
    const result = greedyAssignJobs(techs, jobs)
    const assigned = result.get('t1')!
    expect(assigned.length).toBe(3)
    expect(new Set(assigned)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('moves the assigning technician\'s position forward after each pick, so a cluster of jobs stays with one tech', () => {
    const techs = [
      { id: 't1', current_lat: -33.80, current_lng: 151.21 },
      { id: 't2', current_lat: -34.50, current_lng: 151.21 },
    ]
    // Two jobs clustered right next to t1's start; once t1 takes the
    // first, the second should still go to t1 (now even closer), not get
    // pulled to t2 just because t2 was "unused" so far.
    const jobs = [
      { id: 'near1', client_lat: -33.81, client_lng: 151.21, technician_id: null },
      { id: 'near2', client_lat: -33.805, client_lng: 151.211, technician_id: null },
    ]
    const result = greedyAssignJobs(techs, jobs)
    expect(result.get('t1')!.sort()).toEqual(['near1', 'near2'])
    expect(result.get('t2')).toEqual([])
  })
})

describe('twoOptImprove', () => {
  it('returns the input unchanged for fewer than 3 jobs', () => {
    const jobs = [
      { id: 'a', client_lat: -33.90, client_lng: 151.21, technician_id: 't1' },
      { id: 'b', client_lat: -33.88, client_lng: 151.21, technician_id: 't1' },
    ]
    expect(twoOptImprove(-33.87, 151.21, jobs)).toEqual(jobs)
  })

  it('uncrosses a route that visits stops out of geographic order', () => {
    // Start at the origin; stops are laid out in a line, but handed in
    // crossing order (far, near, middle) — 2-opt should straighten this
    // into visiting order without changing which stops are included.
    const start = { lat: -33.80, lng: 151.21 }
    const jobs = [
      { id: 'far', client_lat: -34.20, client_lng: 151.21, technician_id: 't1' },
      { id: 'near', client_lat: -33.85, client_lng: 151.21, technician_id: 't1' },
      { id: 'middle', client_lat: -34.00, client_lng: 151.21, technician_id: 't1' },
    ]
    const totalDistance = (order: typeof jobs) => {
      let total = haversineKm(start.lat, start.lng, order[0].client_lat, order[0].client_lng)
      for (let i = 0; i < order.length - 1; i++) {
        total += haversineKm(order[i].client_lat, order[i].client_lng, order[i + 1].client_lat, order[i + 1].client_lng)
      }
      return total
    }
    const improved = twoOptImprove(start.lat, start.lng, jobs)
    expect(totalDistance(improved)).toBeLessThanOrEqual(totalDistance(jobs))
    expect(improved.map(j => j.id)).toEqual(['near', 'middle', 'far'])
  })

  it('never returns a route longer than the one it started from', () => {
    const start = { lat: -33.87, lng: 151.21 }
    const jobs = [
      { id: 'a', client_lat: -33.90, client_lng: 151.22, technician_id: 't1' },
      { id: 'b', client_lat: -33.95, client_lng: 151.18, technician_id: 't1' },
      { id: 'c', client_lat: -33.88, client_lng: 151.25, technician_id: 't1' },
      { id: 'd', client_lat: -34.01, client_lng: 151.20, technician_id: 't1' },
    ]
    const totalDistance = (order: typeof jobs) => {
      let total = haversineKm(start.lat, start.lng, order[0].client_lat, order[0].client_lng)
      for (let i = 0; i < order.length - 1; i++) {
        total += haversineKm(order[i].client_lat, order[i].client_lng, order[i + 1].client_lat, order[i + 1].client_lng)
      }
      return total
    }
    const improved = twoOptImprove(start.lat, start.lng, jobs)
    expect(totalDistance(improved)).toBeLessThanOrEqual(totalDistance(jobs) + 1e-9)
    expect(new Set(improved.map(j => j.id))).toEqual(new Set(jobs.map(j => j.id)))
  })
})

describe('swapImproveAssignment', () => {
  it('leaves a 2-job assignment unchanged when no swap could help', () => {
    const techs = [
      { id: 't1', current_lat: -33.80, current_lng: 151.21 },
      { id: 't2', current_lat: -34.50, current_lng: 151.21 },
    ]
    const jobs = [
      { id: 'jobA', client_lat: -34.48, client_lng: 151.21, technician_id: null },
      { id: 'jobB', client_lat: -33.82, client_lng: 151.21, technician_id: null },
    ]
    const assignment = greedyAssignJobs(techs, jobs)
    const result = swapImproveAssignment(techs, jobs, assignment)
    expect(result.get('t1')).toEqual(['jobB'])
    expect(result.get('t2')).toEqual(['jobA'])
  })

  it('never returns a total cost worse than the greedy assignment it started from', () => {
    // Fixed fixture (not randomized in the test itself) found by an
    // offline search specifically because plain greedyAssignJobs locks
    // in a suboptimal 2-and-2 split here — swapImproveAssignment should
    // find the one swap that fixes it. Verified offline: greedy totals
    // ~157.6km, the one-swap fix totals ~150.1km.
    const techs = [
      { id: 't1', current_lat: -34.3178, current_lng: 151.3816 },
      { id: 't2', current_lat: -34.6708, current_lng: 151.6466 },
    ]
    const jobs = [
      { id: 'job1', client_lat: -34.5381, client_lng: 151.0530, technician_id: null },
      { id: 'job2', client_lat: -34.3205, client_lng: 151.7511, technician_id: null },
      { id: 'job3', client_lat: -34.2486, client_lng: 151.1469, technician_id: null },
      { id: 'job4', client_lat: -34.7966, client_lng: 151.3025, technician_id: null },
    ]
    const jobsById = new Map(jobs.map(j => [j.id, j]))

    const costOf = (assignment: Map<string, string[]>) => {
      let total = 0
      for (const t of techs) {
        const theirJobs = (assignment.get(t.id) || []).map(id => jobsById.get(id)!)
        const ordered = twoOptImprove(t.current_lat, t.current_lng, theirJobs)
        let lat = t.current_lat, lng = t.current_lng
        for (const j of ordered) {
          total += haversineKm(lat, lng, j.client_lat, j.client_lng)
          lat = j.client_lat; lng = j.client_lng
        }
      }
      return total
    }

    const greedy = greedyAssignJobs(techs, jobs)
    expect(greedy.get('t1')).toEqual(['job3', 'job1'])
    expect(greedy.get('t2')).toEqual(['job4', 'job2'])
    const greedyCost = costOf(greedy)
    expect(greedyCost).toBeCloseTo(157.640, 1)

    const improved = swapImproveAssignment(techs, jobs, greedy)
    const improvedCost = costOf(improved)

    // The real guarantee this function exists to provide: strictly
    // non-worse than greedy, on real input where greedy alone is
    // measurably suboptimal.
    expect(improvedCost).toBeLessThanOrEqual(greedyCost + 1e-6)
    expect(improvedCost).toBeLessThan(greedyCost - 5) // confirms it actually found the real improvement, not a no-op
    expect(improvedCost).toBeCloseTo(150.095, 1)

    // every job still assigned exactly once across both technicians
    const allAssigned = [...improved.values()].flat().sort()
    expect(allAssigned).toEqual(jobs.map(j => j.id).sort())
  })

  it('never loses or duplicates jobs when technicians have uneven loads', () => {
    const techs = [
      { id: 't1', current_lat: -33.80, current_lng: 151.21 },
      { id: 't2', current_lat: -34.50, current_lng: 151.25 },
      { id: 't3', current_lat: -33.95, current_lng: 151.05 },
    ]
    const jobs = [
      { id: 'a', client_lat: -33.82, client_lng: 151.20, technician_id: null },
      { id: 'b', client_lat: -33.90, client_lng: 151.15, technician_id: null },
      { id: 'c', client_lat: -34.40, client_lng: 151.22, technician_id: null },
      { id: 'd', client_lat: -34.00, client_lng: 151.00, technician_id: null },
      { id: 'e', client_lat: -33.78, client_lng: 151.23, technician_id: null },
    ]
    const assignment = greedyAssignJobs(techs, jobs)
    const result = swapImproveAssignment(techs, jobs, assignment)
    const allAssigned = [...result.values()].flat().sort()
    expect(allAssigned).toEqual(jobs.map(j => j.id).sort())
  })
})

describe('relocateImproveAssignment', () => {
  it('leaves a well-balanced 2-job assignment unchanged when no relocate could help', () => {
    const techs = [
      { id: 't1', current_lat: -33.80, current_lng: 151.21 },
      { id: 't2', current_lat: -34.50, current_lng: 151.21 },
    ]
    const jobs = [
      { id: 'jobA', client_lat: -34.48, client_lng: 151.21, technician_id: null },
      { id: 'jobB', client_lat: -33.82, client_lng: 151.21, technician_id: null },
    ]
    const assignment = greedyAssignJobs(techs, jobs)
    const result = relocateImproveAssignment(techs, jobs, assignment)
    expect(result.get('t1')).toEqual(['jobB'])
    expect(result.get('t2')).toEqual(['jobA'])
  })

  it('finds a real improvement swapImproveAssignment alone cannot reach, on a fixed verified fixture', () => {
    // Found by an offline search specifically because this fixture
    // converges under swapImproveAssignment alone (no exchange helps) but
    // still has one technician overloaded relative to the other — only a
    // one-sided relocate (move a job, give nothing back) fixes it.
    // Verified offline: swap-only totals ~195.4km, relocate-after-swap
    // totals ~176.9km, a real ~18.5km reduction, not a rounding artifact.
    const techs = [
      { id: 't1', current_lat: -34.2415, current_lng: 151.9873 },
      { id: 't2', current_lat: -34.1778, current_lng: 151.1409 },
    ]
    const jobs = [
      { id: 'job1', client_lat: -34.4353, client_lng: 151.7556, technician_id: null },
      { id: 'job2', client_lat: -33.8065, client_lng: 151.3734, technician_id: null },
      { id: 'job3', client_lat: -34.7952, client_lng: 151.7146, technician_id: null },
      { id: 'job4', client_lat: -34.5411, client_lng: 151.1375, technician_id: null },
      { id: 'job5', client_lat: -34.6352, client_lng: 151.7439, technician_id: null },
    ]
    const jobsById = new Map(jobs.map(j => [j.id, j]))

    const costOf = (assignment: Map<string, string[]>) => {
      let total = 0
      for (const t of techs) {
        const theirJobs = (assignment.get(t.id) || []).map(id => jobsById.get(id)!)
        const ordered = twoOptImprove(t.current_lat, t.current_lng, theirJobs)
        let lat = t.current_lat, lng = t.current_lng
        for (const j of ordered) {
          total += haversineKm(lat, lng, j.client_lat, j.client_lng)
          lat = j.client_lat; lng = j.client_lng
        }
      }
      return total
    }

    const greedy = greedyAssignJobs(techs, jobs)
    const swapped = swapImproveAssignment(techs, jobs, greedy)
    const swappedCost = costOf(swapped)
    expect(swappedCost).toBeCloseTo(195.447, 1)

    const relocated = relocateImproveAssignment(techs, jobs, swapped)
    const relocatedCost = costOf(relocated)

    expect(relocatedCost).toBeLessThanOrEqual(swappedCost + 1e-6)
    expect(relocatedCost).toBeLessThan(swappedCost - 10) // confirms a real improvement was found, not a no-op
    expect(relocatedCost).toBeCloseTo(176.918, 1)

    const allAssigned = [...relocated.values()].flat().sort()
    expect(allAssigned).toEqual(jobs.map(j => j.id).sort())
  })

  it('never loses or duplicates jobs across uneven technician loads', () => {
    const techs = [
      { id: 't1', current_lat: -33.80, current_lng: 151.21 },
      { id: 't2', current_lat: -34.50, current_lng: 151.25 },
      { id: 't3', current_lat: -33.95, current_lng: 151.05 },
    ]
    const jobs = [
      { id: 'a', client_lat: -33.82, client_lng: 151.20, technician_id: null },
      { id: 'b', client_lat: -33.90, client_lng: 151.15, technician_id: null },
      { id: 'c', client_lat: -34.40, client_lng: 151.22, technician_id: null },
      { id: 'd', client_lat: -34.00, client_lng: 151.00, technician_id: null },
      { id: 'e', client_lat: -33.78, client_lng: 151.23, technician_id: null },
    ]
    const assignment = greedyAssignJobs(techs, jobs)
    const result = relocateImproveAssignment(techs, jobs, assignment)
    const allAssigned = [...result.values()].flat().sort()
    expect(allAssigned).toEqual(jobs.map(j => j.id).sort())
  })
})

describe('chainEtas', () => {
  const start = new Date('2026-09-16T08:00:00.000Z')

  it('returns an empty array for no jobs', () => {
    expect(chainEtas(-33.87, 151.21, [], start, 40, 30)).toEqual([])
  })

  it('assigns 1-indexed sequence numbers in the given order, without reordering', () => {
    const jobs = [
      { id: 'b', client_lat: -33.88, client_lng: 151.21, technician_id: 't1' },
      { id: 'a', client_lat: -33.90, client_lng: 151.21, technician_id: 't1' },
    ]
    const stops = chainEtas(-33.87, 151.21, jobs, start, 40, 30)
    expect(stops.map(s => s.id)).toEqual(['b', 'a'])
    expect(stops.map(s => s.sequence)).toEqual([1, 2])
  })

  it('chains estimated arrival forward using speed and dwell time, never backward', () => {
    const jobs = [
      { id: 'a', client_lat: -33.90, client_lng: 151.21, technician_id: 't1' },
      { id: 'b', client_lat: -33.95, client_lng: 151.21, technician_id: 't1' },
    ]
    const stops = chainEtas(-33.87, 151.21, jobs, start, 40, 30)
    const firstArrival = new Date(stops[0].estimatedArrival).getTime()
    const secondArrival = new Date(stops[1].estimatedArrival).getTime()
    expect(firstArrival).toBeGreaterThan(start.getTime())
    expect(secondArrival - firstArrival).toBeGreaterThanOrEqual(30 * 60000)
  })
})

describe('currentPlanDistanceKm', () => {
  it('returns 0 when no jobs are assigned to any listed technician', () => {
    const techs = [{ id: 't1', current_lat: -33.87, current_lng: 151.21 }]
    const jobs = [{ id: 'a', client_lat: -33.90, client_lng: 151.21, technician_id: null }]
    expect(currentPlanDistanceKm(techs, jobs)).toBe(0)
  })

  it('sums distance for one technician\'s jobs in route_sequence order', () => {
    const techs = [{ id: 't1', current_lat: -33.87, current_lng: 151.21 }]
    const jobs = [
      { id: 'second', client_lat: -33.95, client_lng: 151.21, technician_id: 't1', route_sequence: 2 },
      { id: 'first', client_lat: -33.90, client_lng: 151.21, technician_id: 't1', route_sequence: 1 },
    ]
    const expected =
      haversineKm(-33.87, 151.21, -33.90, 151.21) +
      haversineKm(-33.90, 151.21, -33.95, 151.21)
    expect(currentPlanDistanceKm(techs, jobs)).toBeCloseTo(expected, 6)
  })

  it('sums distance across multiple technicians independently', () => {
    const techs = [
      { id: 't1', current_lat: -33.87, current_lng: 151.21 },
      { id: 't2', current_lat: -34.50, current_lng: 151.21 },
    ]
    const jobs = [
      { id: 'a', client_lat: -33.90, client_lng: 151.21, technician_id: 't1', route_sequence: 1 },
      { id: 'b', client_lat: -34.55, client_lng: 151.21, technician_id: 't2', route_sequence: 1 },
    ]
    const expected =
      haversineKm(-33.87, 151.21, -33.90, 151.21) +
      haversineKm(-34.50, 151.21, -34.55, 151.21)
    expect(currentPlanDistanceKm(techs, jobs)).toBeCloseTo(expected, 6)
  })
})

// Same cases as check-weather-risk/logic.test.ts — this file duplicates
// that one's date-window helpers (see logic.ts's header for why), so the
// same fixed instants should produce the same results here.

describe('addLocalDays', () => {
  it('adds days within the same month', () => {
    expect(addLocalDays('2026-01-15', 1)).toBe('2026-01-16')
  })

  it('rolls over a month boundary', () => {
    expect(addLocalDays('2026-01-31', 1)).toBe('2026-02-01')
  })

  it('rolls over a year boundary', () => {
    expect(addLocalDays('2025-12-31', 1)).toBe('2026-01-01')
  })
})

describe('localOffsetMinutes', () => {
  it('returns +660 (AEDT, UTC+11) for a Sydney summer date', () => {
    expect(localOffsetMinutes(new Date('2026-01-15T00:00:00Z'), 'Australia/Sydney')).toBe(660)
  })

  it('returns +600 (AEST, UTC+10) for a Sydney winter date', () => {
    expect(localOffsetMinutes(new Date('2026-07-15T00:00:00Z'), 'Australia/Sydney')).toBe(600)
  })
})

describe('localMidnightUTC', () => {
  it('computes the UTC instant of Sydney local midnight during AEDT (UTC+11)', () => {
    expect(localMidnightUTC('2026-01-15', 'Australia/Sydney').toISOString()).toBe('2026-01-14T13:00:00.000Z')
  })

  it('computes the UTC instant of Sydney local midnight during AEST (UTC+10)', () => {
    expect(localMidnightUTC('2026-07-15', 'Australia/Sydney').toISOString()).toBe('2026-07-14T14:00:00.000Z')
  })

  it('produces a full 24-hour window between consecutive local midnights', () => {
    const start = localMidnightUTC('2026-01-15', 'Australia/Sydney')
    const end = localMidnightUTC(addLocalDays('2026-01-15', 1), 'Australia/Sydney')
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })
})
