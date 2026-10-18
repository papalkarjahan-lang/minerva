import { describe, it, expect } from 'vitest'
import { haversineKm, greedyAssignJobs, twoOptImprove, chainEtas, currentPlanDistanceKm } from './logic'

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
