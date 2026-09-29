import { describe, it, expect } from 'vitest'
import { evaluateForecastRisk, addLocalDays, localOffsetMinutes, localMidnightUTC } from './logic'

describe('evaluateForecastRisk', () => {
  it('is not risky when all values are below every threshold', () => {
    const result = evaluateForecastRisk({ rainProb: 20, windKmh: 15, maxTempC: 25 })
    expect(result.risky).toBe(false)
    expect(result.reasons).toEqual([])
  })

  it('is risky on rain probability meeting the threshold exactly', () => {
    const result = evaluateForecastRisk({ rainProb: 70, windKmh: 10, maxTempC: 20 })
    expect(result.risky).toBe(true)
    expect(result.reasons).toEqual(['70% chance of rain'])
  })

  it('is risky on wind speed meeting the threshold exactly', () => {
    const result = evaluateForecastRisk({ rainProb: 0, windKmh: 60, maxTempC: 20 })
    expect(result.risky).toBe(true)
    expect(result.reasons).toEqual(['wind up to 60 km/h'])
  })

  it('is risky on heat meeting the threshold exactly', () => {
    const result = evaluateForecastRisk({ rainProb: 0, windKmh: 0, maxTempC: 40 })
    expect(result.risky).toBe(true)
    expect(result.reasons).toEqual(['forecast high of 40°C'])
  })

  it('accumulates all matching reasons when multiple thresholds are met', () => {
    const result = evaluateForecastRisk({ rainProb: 80, windKmh: 70, maxTempC: 42 })
    expect(result.risky).toBe(true)
    expect(result.reasons).toEqual(['80% chance of rain', 'wind up to 70 km/h', 'forecast high of 42°C'])
  })

  it('is not risky just below every threshold', () => {
    const result = evaluateForecastRisk({ rainProb: 69, windKmh: 59, maxTempC: 39 })
    expect(result.risky).toBe(false)
  })
})

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
