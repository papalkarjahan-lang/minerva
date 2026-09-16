import { describe, it, expect } from 'vitest'
import { computeRollingWeekHours, shouldFlagBurnout, BURNOUT_HOURS_THRESHOLD } from './logic'

describe('computeRollingWeekHours', () => {
  it('returns 0 for no breadcrumbs', () => {
    expect(computeRollingWeekHours([])).toBe(0)
  })

  it('returns 0 when only one breadcrumb exists for a day (min equals max)', () => {
    expect(computeRollingWeekHours([{ recorded_at: '2026-01-01T08:00:00.000Z' }])).toBe(0)
  })

  it('sums (max - min) per calendar day across multiple days', () => {
    const result = computeRollingWeekHours([
      { recorded_at: '2026-01-01T08:00:00.000Z' },
      { recorded_at: '2026-01-01T16:00:00.000Z' }, // 8h on day 1
      { recorded_at: '2026-01-02T09:00:00.000Z' },
      { recorded_at: '2026-01-02T14:30:00.000Z' }, // 5.5h on day 2
    ])
    expect(result).toBe(13.5)
  })

  it('ignores breadcrumb order when computing min/max per day', () => {
    const result = computeRollingWeekHours([
      { recorded_at: '2026-01-01T16:00:00.000Z' },
      { recorded_at: '2026-01-01T08:00:00.000Z' },
    ])
    expect(result).toBe(8)
  })
})

describe('shouldFlagBurnout', () => {
  it('does not flag when below the threshold', () => {
    expect(shouldFlagBurnout(BURNOUT_HOURS_THRESHOLD - 0.1, null)).toBe(false)
  })

  it('flags when at the threshold and never previously flagged', () => {
    expect(shouldFlagBurnout(BURNOUT_HOURS_THRESHOLD, null)).toBe(true)
  })

  it('does not re-flag within the re-alert window', () => {
    const now = new Date('2026-01-10T00:00:00.000Z').getTime()
    const flaggedAt = new Date('2026-01-08T00:00:00.000Z').toISOString() // 2 days ago
    expect(shouldFlagBurnout(60, flaggedAt, now)).toBe(false)
  })

  it('re-flags once the re-alert window has passed', () => {
    const now = new Date('2026-01-10T00:00:00.000Z').getTime()
    const flaggedAt = new Date('2026-01-01T00:00:00.000Z').toISOString() // 9 days ago
    expect(shouldFlagBurnout(60, flaggedAt, now)).toBe(true)
  })
})
