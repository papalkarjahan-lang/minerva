import { describe, it, expect } from 'vitest'
import { computeThresholds, evaluateCredential } from './logic'

describe('computeThresholds', () => {
  it('computes 30/14/7/3-day-ahead and today dates as YYYY-MM-DD strings', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const t = computeThresholds(now)
    expect(t.today).toBe('2026-01-01')
    expect(t.in3).toBe('2026-01-04')
    expect(t.in7).toBe('2026-01-08')
    expect(t.in14).toBe('2026-01-15')
    expect(t.in30).toBe('2026-01-31')
  })
})

describe('evaluateCredential', () => {
  const thresholds = computeThresholds(new Date('2026-01-01T00:00:00.000Z'))
  const base = { warning30SentAt: null, warning14SentAt: null, warning7SentAt: null, hasCurrentJob: false }

  it('flags the 30-day threshold when expiring between 14 and 30 days out', () => {
    const result = evaluateCredential({ ...base, expiryDate: '2026-01-20' }, thresholds)
    expect(result.should30).toBe(true)
    expect(result.should14).toBe(false)
    expect(result.should7).toBe(false)
  })

  it('flags the 14-day threshold when expiring between 7 and 14 days out', () => {
    const result = evaluateCredential({ ...base, expiryDate: '2026-01-10' }, thresholds)
    expect(result.should30).toBe(false)
    expect(result.should14).toBe(true)
    expect(result.should7).toBe(false)
  })

  it('flags the 7-day threshold when expiring within 7 days', () => {
    const result = evaluateCredential({ ...base, expiryDate: '2026-01-05' }, thresholds)
    expect(result.should30).toBe(false)
    expect(result.should14).toBe(false)
    expect(result.should7).toBe(true)
  })

  it('does not re-flag a threshold that was already warned', () => {
    const result = evaluateCredential({ ...base, expiryDate: '2026-01-20', warning30SentAt: '2025-12-30T00:00:00Z' }, thresholds)
    expect(result.should30).toBe(false)
  })

  it('is not urgent when within 3 days but the technician has no current job', () => {
    const result = evaluateCredential({ ...base, expiryDate: '2026-01-02', hasCurrentJob: false }, thresholds)
    expect(result.urgent).toBe(false)
  })

  it('is urgent when within 3 days and the technician has a current job', () => {
    const result = evaluateCredential({ ...base, expiryDate: '2026-01-02', hasCurrentJob: true }, thresholds)
    expect(result.urgent).toBe(true)
    expect(result.expired).toBe(false)
  })

  it('is urgent and expired when already past its expiry date and on a job', () => {
    const result = evaluateCredential({ ...base, expiryDate: '2025-12-31', hasCurrentJob: true }, thresholds)
    expect(result.urgent).toBe(true)
    expect(result.expired).toBe(true)
  })

  it('is not urgent when expiry is more than 3 days out even if on a job', () => {
    const result = evaluateCredential({ ...base, expiryDate: '2026-01-10', hasCurrentJob: true }, thresholds)
    expect(result.urgent).toBe(false)
  })
})
