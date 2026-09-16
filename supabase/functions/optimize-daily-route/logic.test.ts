import { describe, it, expect } from 'vitest'
import { haversineKm, planRoute } from './logic'

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(-33.87, 151.21, -33.87, 151.21)).toBe(0)
  })

  it('returns roughly the known Sydney-Melbourne great-circle distance', () => {
    // Sydney (-33.8688, 151.2093) to Melbourne (-37.8136, 144.9631) is
    // ~713km great-circle distance — allow a wide tolerance since this is
    // just a sanity check on the formula, not a precision requirement.
    const d = haversineKm(-33.8688, 151.2093, -37.8136, 144.9631)
    expect(d).toBeGreaterThan(700)
    expect(d).toBeLessThan(730)
  })
})

describe('planRoute', () => {
  const start = new Date('2026-09-16T08:00:00.000Z')

  it('returns an empty array for no jobs', () => {
    expect(planRoute(-33.87, 151.21, [], start, 40, 30)).toEqual([])
  })

  it('visits the nearest job first, not insertion order', () => {
    const jobs = [
      { id: 'far', client_lat: -34.5, client_lng: 151.21 }, // ~70km away
      { id: 'near', client_lat: -33.88, client_lng: 151.21 }, // ~1.1km away
    ]
    const stops = planRoute(-33.87, 151.21, jobs, start, 40, 30)
    expect(stops.map(s => s.id)).toEqual(['near', 'far'])
  })

  it('assigns 1-indexed sequence numbers in visiting order', () => {
    const jobs = [
      { id: 'a', client_lat: -33.90, client_lng: 151.21 },
      { id: 'b', client_lat: -33.88, client_lng: 151.21 },
    ]
    const stops = planRoute(-33.87, 151.21, jobs, start, 40, 30)
    expect(stops.map(s => s.sequence)).toEqual([1, 2])
  })

  it('chains estimated arrival forward using speed and dwell time, never backward', () => {
    const jobs = [
      { id: 'a', client_lat: -33.90, client_lng: 151.21 },
      { id: 'b', client_lat: -33.95, client_lng: 151.21 },
    ]
    const stops = planRoute(-33.87, 151.21, jobs, start, 40, 30)
    const firstArrival = new Date(stops[0].estimatedArrival).getTime()
    const secondArrival = new Date(stops[1].estimatedArrival).getTime()
    expect(firstArrival).toBeGreaterThan(start.getTime())
    expect(secondArrival).toBeGreaterThan(firstArrival)
    // second arrival must be at least the dwell time (30min) after the
    // first, on top of whatever travel time the leg between a and b took.
    expect(secondArrival - firstArrival).toBeGreaterThanOrEqual(30 * 60000)
  })

  it('does not mutate the input jobs array', () => {
    const jobs = [
      { id: 'a', client_lat: -33.90, client_lng: 151.21 },
      { id: 'b', client_lat: -33.88, client_lng: 151.21 },
    ]
    const jobsCopy = JSON.parse(JSON.stringify(jobs))
    planRoute(-33.87, 151.21, jobs, start, 40, 30)
    expect(jobs).toEqual(jobsCopy)
  })
})
