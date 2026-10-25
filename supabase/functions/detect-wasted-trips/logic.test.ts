import { describe, it, expect } from 'vitest'
import { wasOnSite, groupJobsByTechnicianDate, findOverloadedGroups } from './logic'

describe('wasOnSite', () => {
  const clientLat = -33.87
  const clientLng = 151.21

  it('returns false for an empty ping list', () => {
    expect(wasOnSite([], clientLat, clientLng, 0.15)).toBe(false)
  })

  it('returns true when at least one ping is within the radius', () => {
    const pings = [
      { lat: -34.5, lng: 151.21 }, // far away
      { lat: -33.8701, lng: 151.2101 }, // essentially on top of the client
    ]
    expect(wasOnSite(pings, clientLat, clientLng, 0.15)).toBe(true)
  })

  it('returns false when every ping is outside the radius', () => {
    const pings = [{ lat: -34.5, lng: 151.21 }]
    expect(wasOnSite(pings, clientLat, clientLng, 0.15)).toBe(false)
  })
})

describe('groupJobsByTechnicianDate', () => {
  it('groups by technician+date and counts correctly', () => {
    // Times chosen to stay clear of the Sydney/UTC date boundary (see the
    // dedicated boundary test below) — this test is only about the
    // grouping/counting logic itself.
    const jobs = [
      { business_id: 'b1', technician_id: 't1', scheduled_time: '2026-09-16T08:00:00Z' },
      { business_id: 'b1', technician_id: 't1', scheduled_time: '2026-09-16T10:00:00Z' },
      { business_id: 'b1', technician_id: 't2', scheduled_time: '2026-09-16T09:00:00Z' },
      { business_id: 'b1', technician_id: 't1', scheduled_time: '2026-09-17T08:00:00Z' },
    ]
    const groups = groupJobsByTechnicianDate(jobs)
    const t1Sep16 = groups.find(g => g.technicianId === 't1' && g.date === '2026-09-16')
    const t1Sep17 = groups.find(g => g.technicianId === 't1' && g.date === '2026-09-17')
    const t2Sep16 = groups.find(g => g.technicianId === 't2' && g.date === '2026-09-16')
    expect(t1Sep16?.count).toBe(2)
    expect(t1Sep17?.count).toBe(1)
    expect(t2Sep16?.count).toBe(1)
    expect(groups).toHaveLength(3)
  })

  it('skips jobs missing technician_id or scheduled_time', () => {
    const jobs = [
      { business_id: 'b1', technician_id: '', scheduled_time: '2026-09-16T08:00:00Z' },
      { business_id: 'b1', technician_id: 't1', scheduled_time: '' },
    ]
    expect(groupJobsByTechnicianDate(jobs)).toEqual([])
  })

  it('buckets by Sydney local date, not UTC date, across the UTC-midnight boundary', () => {
    // Found 2026-10-25: a raw UTC-date slice split a technician's real
    // same-day jobs across two buckets whenever any fell before ~11am
    // Sydney time (UTC midnight) — undercounting both and making the
    // overload heuristic systematically less likely to catch a genuinely
    // overloaded day. 2026-09-16T14:00:00Z is 2026-09-17 00:00 AEST
    // (UTC+10, no daylight saving in September) — i.e. the very first
    // instant of the NEXT Sydney day, not still part of Sep 16 the way a
    // naive .slice(0, 10) on the UTC string would see it.
    const jobs = [
      { business_id: 'b1', technician_id: 't1', scheduled_time: '2026-09-16T08:00:00Z' }, // 2026-09-16 18:00 Sydney
      { business_id: 'b1', technician_id: 't1', scheduled_time: '2026-09-16T14:00:00Z' }, // 2026-09-17 00:00 Sydney
    ]
    const groups = groupJobsByTechnicianDate(jobs)
    expect(groups.find(g => g.date === '2026-09-16')?.count).toBe(1)
    expect(groups.find(g => g.date === '2026-09-17')?.count).toBe(1)
  })
})

describe('findOverloadedGroups', () => {
  it('excludes groups at or below the threshold, includes ones strictly over it', () => {
    const groups = [
      { businessId: 'b1', technicianId: 't1', date: '2026-09-16', count: 6 },
      { businessId: 'b1', technicianId: 't2', date: '2026-09-16', count: 7 },
    ]
    const overloaded = findOverloadedGroups(groups, 6)
    expect(overloaded.map(g => g.technicianId)).toEqual(['t2'])
  })
})
