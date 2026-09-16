import { describe, it, expect } from 'vitest'
import { haversineMeters, checkGeofence, isMaintenanceDue } from './logic'

describe('haversineMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineMeters(-33.87, 151.21, -33.87, 151.21)).toBe(0)
  })
})

describe('checkGeofence', () => {
  const siteLat = -33.87
  const siteLng = 151.21

  it('is not breached when inside the given radius', () => {
    const result = checkGeofence(-33.8701, 151.2101, siteLat, siteLng, 500)
    expect(result.breached).toBe(false)
  })

  it('is breached when outside the given radius', () => {
    const result = checkGeofence(-33.9, 151.21, siteLat, siteLng, 200)
    expect(result.breached).toBe(true)
    expect(result.distanceMeters).toBeGreaterThan(200)
  })

  it('defaults the radius to 200m when none is set', () => {
    const farEnough = checkGeofence(-33.9, 151.21, siteLat, siteLng, null)
    expect(farEnough.breached).toBe(true)
    const closeEnough = checkGeofence(-33.8701, 151.2101, siteLat, siteLng, undefined)
    expect(closeEnough.breached).toBe(false)
  })
})

describe('isMaintenanceDue', () => {
  it('is not due when engine hours are below the threshold', () => {
    expect(isMaintenanceDue(100, 0, 250)).toBe(false)
  })

  it('is due when engine hours reach the threshold exactly', () => {
    expect(isMaintenanceDue(250, 0, 250)).toBe(true)
  })

  it('is due when engine hours exceed the threshold', () => {
    expect(isMaintenanceDue(400, 100, 250)).toBe(true)
  })

  it('defaults last-maintenance to 0 when unset', () => {
    expect(isMaintenanceDue(250, null, 250)).toBe(true)
    expect(isMaintenanceDue(249, undefined, 250)).toBe(false)
  })

  it('defaults the interval to 250h when unset', () => {
    expect(isMaintenanceDue(250, 0, null)).toBe(true)
    expect(isMaintenanceDue(249, 0, undefined)).toBe(false)
  })
})
