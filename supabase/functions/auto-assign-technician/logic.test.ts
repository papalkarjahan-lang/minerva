import { describe, it, expect } from 'vitest'
import {
  haversineKm,
  filterQualifiedTechnicians,
  pickNearestTechnician,
  pickNearestSubcontractor,
  isBeyondMaxKm,
  EMERGENCY_TIEBREAK_KM,
  FATIGUE_BASELINE_HOURS,
} from './logic'

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(-33.87, 151.21, -33.87, 151.21)).toBe(0)
  })

  it('returns a sane distance for Sydney to Melbourne (~713km great-circle)', () => {
    const d = haversineKm(-33.8688, 151.2093, -37.8136, 144.9631)
    expect(d).toBeGreaterThan(700)
    expect(d).toBeLessThan(730)
  })
})

describe('filterQualifiedTechnicians', () => {
  it('keeps only technicians whose id is in the qualified set', () => {
    const free = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    const qualified = new Set(['b', 'c'])
    expect(filterQualifiedTechnicians(free, qualified).map(t => t.id)).toEqual(['b', 'c'])
  })

  it('returns empty when nobody is qualified', () => {
    const free = [{ id: 'a' }, { id: 'b' }]
    expect(filterQualifiedTechnicians(free, new Set())).toEqual([])
  })
})

describe('pickNearestTechnician', () => {
  const jobLat = -33.87
  const jobLng = 151.21

  it('returns null when there are no candidates', () => {
    expect(pickNearestTechnician([], jobLat, jobLng)).toEqual({ nearest: null, nearestDist: null })
  })

  it('falls back to the first candidate with no distance when job has no coordinates', () => {
    const candidates = [{ id: 'a', current_lat: -33.9, current_lng: 151.2 }, { id: 'b', current_lat: -33.8, current_lng: 151.3 }]
    expect(pickNearestTechnician(candidates, null, null)).toEqual({ nearest: candidates[0], nearestDist: null })
  })

  it('picks the closer technician when no tiebreak factors apply', () => {
    const far = { id: 'far', current_lat: -37.8136, current_lng: 144.9631 } // Melbourne
    const near = { id: 'near', current_lat: -33.9, current_lng: 151.22 } // near Sydney job
    const { nearest, nearestDist } = pickNearestTechnician([far, near], jobLat, jobLng)
    expect(nearest!.id).toBe('near')
    expect(nearestDist).not.toBeNull()
  })

  it('emergency tiebreak lets a slightly-farther, less-recently-emergency-tasked tech win over a very-nearby overloaded one', () => {
    // Two technicians about 1km apart in distance from the job — small enough
    // that a couple of recent emergency jobs should flip the choice.
    const overloaded = { id: 'overloaded', current_lat: -33.871, current_lng: 151.211, rolling_emergency_job_count: 5 }
    const fresh = { id: 'fresh', current_lat: -33.872, current_lng: 151.212, rolling_emergency_job_count: 0 }
    const { nearest } = pickNearestTechnician([overloaded, fresh], jobLat, jobLng)
    expect(nearest!.id).toBe('fresh')
  })

  it('a genuinely much-closer technician still wins despite a heavy emergency-tiebreak penalty', () => {
    // ~40km penalty (20 emergency jobs * 2km) is nowhere near enough to flip
    // the choice against someone hundreds of km farther away (Melbourne).
    const veryClose = { id: 'veryClose', current_lat: -33.8701, current_lng: 151.2101, rolling_emergency_job_count: 20 }
    const farther = { id: 'farther', current_lat: -37.8136, current_lng: 144.9631, rolling_emergency_job_count: 0 }
    const { nearest } = pickNearestTechnician([veryClose, farther], jobLat, jobLng)
    expect(nearest!.id).toBe('veryClose')
  })

  it('fatigue tiebreak only penalizes hours beyond the baseline', () => {
    const atBaseline = { id: 'atBaseline', current_lat: -33.871, current_lng: 151.211, rolling_week_hours: FATIGUE_BASELINE_HOURS }
    const overBaseline = { id: 'overBaseline', current_lat: -33.8705, current_lng: 151.2105, rolling_week_hours: FATIGUE_BASELINE_HOURS + 20 }
    // overBaseline is closer in raw distance but has worked 20hrs beyond baseline
    const { nearest } = pickNearestTechnician([atBaseline, overBaseline], jobLat, jobLng)
    expect(nearest!.id).toBe('atBaseline')
  })
})

describe('pickNearestSubcontractor', () => {
  it('returns null when there are no candidates', () => {
    expect(pickNearestSubcontractor([], -33.87, 151.21)).toEqual({ nearest: null, nearestDist: null })
  })

  it('picks the closer subcontractor with no emergency/fatigue tiebreak', () => {
    const far = { id: 'far', current_lat: -37.8136, current_lng: 144.9631 }
    const near = { id: 'near', current_lat: -33.9, current_lng: 151.22 }
    const { nearest } = pickNearestSubcontractor([far, near], -33.87, 151.21)
    expect(nearest!.id).toBe('near')
  })
})

describe('isBeyondMaxKm', () => {
  it('is false when maxKm is unset (unlimited radius)', () => {
    expect(isBeyondMaxKm(null, 500)).toBe(false)
    expect(isBeyondMaxKm(undefined, 500)).toBe(false)
  })

  it('is false when distance is unknown', () => {
    expect(isBeyondMaxKm(10, null)).toBe(false)
  })

  it('is true only when distance exceeds the configured cap', () => {
    expect(isBeyondMaxKm(10, 11)).toBe(true)
    expect(isBeyondMaxKm(10, 10)).toBe(false)
    expect(isBeyondMaxKm(10, 9)).toBe(false)
  })
})
