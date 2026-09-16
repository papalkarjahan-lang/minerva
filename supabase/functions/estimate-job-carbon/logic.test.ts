import { describe, it, expect } from 'vitest'
import { haversineKm, totalChainedKm, computeCarbonEstimate } from './logic'

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(-33.87, 151.21, -33.87, 151.21)).toBe(0)
  })
})

describe('totalChainedKm', () => {
  it('returns 0 for a single stop (no leg to sum)', () => {
    expect(totalChainedKm([{ client_lat: -33.87, client_lng: 151.21 }])).toBe(0)
  })

  it('sums distance across 3+ consecutive legs, not just first-to-last', () => {
    const stops = [
      { client_lat: -33.87, client_lng: 151.21 },
      { client_lat: -33.90, client_lng: 151.21 },
      { client_lat: -33.87, client_lng: 151.21 }, // back near the start — a straight first-to-last shortcut would undercount this
    ]
    const legwise = haversineKm(stops[0].client_lat, stops[0].client_lng, stops[1].client_lat, stops[1].client_lng)
      + haversineKm(stops[1].client_lat, stops[1].client_lng, stops[2].client_lat, stops[2].client_lng)
    expect(totalChainedKm(stops)).toBeCloseTo(legwise, 10)
    expect(totalChainedKm(stops)).toBeGreaterThan(0.01)
  })
})

describe('computeCarbonEstimate', () => {
  it('returns null for fewer than 2 stops', () => {
    expect(computeCarbonEstimate([], 0.25)).toBeNull()
    expect(computeCarbonEstimate([{ client_lat: -33.87, client_lng: 151.21 }], 0.25)).toBeNull()
  })

  it('returns null when total distance is zero (duplicate coordinates)', () => {
    const stops = [
      { client_lat: -33.87, client_lng: 151.21 },
      { client_lat: -33.87, client_lng: 151.21 },
    ]
    expect(computeCarbonEstimate(stops, 0.25)).toBeNull()
  })

  it('computes distance and emissions rounded to 2 decimal places', () => {
    const stops = [
      { client_lat: -33.87, client_lng: 151.21 },
      { client_lat: -33.88, client_lng: 151.21 },
    ]
    const result = computeCarbonEstimate(stops, 0.25)
    expect(result).not.toBeNull()
    const totalKm = totalChainedKm(stops)
    expect(result!.distanceKm).toBeCloseTo(Math.round(totalKm * 100) / 100, 10)
    expect(result!.estimatedKgCo2e).toBeCloseTo(Math.round(totalKm * 0.25 * 100) / 100, 10)
  })

  it('scales linearly with the emissions factor', () => {
    const stops = [
      { client_lat: -33.87, client_lng: 151.21 },
      { client_lat: -33.90, client_lng: 151.21 },
    ]
    const light = computeCarbonEstimate(stops, 0.25)!
    const passenger = computeCarbonEstimate(stops, 0.18)!
    expect(passenger.estimatedKgCo2e).toBeLessThan(light.estimatedKgCo2e)
  })
})
