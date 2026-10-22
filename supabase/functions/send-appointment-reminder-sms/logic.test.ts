import { describe, it, expect } from 'vitest'
import { addLocalDays, localOffsetMinutes, localMidnightUTC } from './logic'

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
