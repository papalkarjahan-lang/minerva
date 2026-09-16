import { describe, it, expect } from 'vitest'
import { haversineMeters, findNearestAsset } from './logic'

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(-33.87, 151.21, -33.87, 151.21)).toBe(0)
  })
})

describe('findNearestAsset', () => {
  const siteLat = -33.87
  const siteLng = 151.21

  it('returns null when there are no candidates', () => {
    expect(findNearestAsset([], siteLat, siteLng)).toBeNull()
  })

  it('returns null when the site has no coordinates', () => {
    const candidates = [{ id: 'a1', current_lat: -33.87, current_lng: 151.21 }]
    expect(findNearestAsset(candidates, null, null)).toBeNull()
  })

  it('skips candidates with missing coordinates', () => {
    const candidates = [
      { id: 'no-coords', current_lat: null, current_lng: null },
      { id: 'has-coords', current_lat: -33.88, current_lng: 151.21 },
    ]
    const result = findNearestAsset(candidates, siteLat, siteLng)
    expect(result?.asset.id).toBe('has-coords')
  })

  it('returns null when every candidate is missing coordinates', () => {
    const candidates = [{ id: 'a1', current_lat: null, current_lng: null }]
    expect(findNearestAsset(candidates, siteLat, siteLng)).toBeNull()
  })

  it('picks the closest of several candidates', () => {
    const candidates = [
      { id: 'far', current_lat: -34.5, current_lng: 151.21 },
      { id: 'near', current_lat: -33.871, current_lng: 151.21 },
      { id: 'mid', current_lat: -33.95, current_lng: 151.21 },
    ]
    const result = findNearestAsset(candidates, siteLat, siteLng)
    expect(result?.asset.id).toBe('near')
    expect(result?.distanceMeters).toBeGreaterThan(0)
  })
})
