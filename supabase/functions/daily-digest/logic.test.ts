import { describe, it, expect } from 'vitest'
import { computeInvoiceStats, isQuietDay, estimateDollarsFromKm, isWeeklySavingsDay } from './logic'

describe('computeInvoiceStats', () => {
  it('returns all zeros for no invoices', () => {
    expect(computeInvoiceStats([])).toEqual({ invoiced: 0, unpaid: 0, avgInvoice: 0 })
  })

  it('excludes voided invoices from every total', () => {
    const stats = computeInvoiceStats([
      { total: 100, status: 'paid' },
      { total: 500, status: 'void' },
    ])
    expect(stats.invoiced).toBe(100)
  })

  it('sums unpaid totals separately from the overall invoiced total', () => {
    const stats = computeInvoiceStats([
      { total: 100, status: 'paid' },
      { total: 50, status: 'unpaid' },
    ])
    expect(stats.invoiced).toBe(150)
    expect(stats.unpaid).toBe(50)
  })

  it('computes the average only across live (non-void) invoices', () => {
    const stats = computeInvoiceStats([
      { total: 100, status: 'paid' },
      { total: 200, status: 'unpaid' },
      { total: 999, status: 'void' },
    ])
    expect(stats.avgInvoice).toBe(150)
  })

  it('handles string totals from Postgres numeric columns', () => {
    const stats = computeInvoiceStats([{ total: '75.50', status: 'paid' }])
    expect(stats.invoiced).toBe(75.5)
  })
})

describe('isQuietDay', () => {
  const allZero = { jobsDone: 0, leadsIn: 0, invoiced: 0, pendingDraftsCount: 0, lowStockCount: 0, silentLeadsCount: 0, stuckInvoicesCount: 0 }

  it('is quiet when every count is zero', () => {
    expect(isQuietDay(allZero)).toBe(true)
  })

  it('is not quiet when jobs were done', () => {
    expect(isQuietDay({ ...allZero, jobsDone: 1 })).toBe(false)
  })

  it('is not quiet when there are pending marketing drafts', () => {
    expect(isQuietDay({ ...allZero, pendingDraftsCount: 1 })).toBe(false)
  })

  it('is not quiet when there are stuck invoices', () => {
    expect(isQuietDay({ ...allZero, stuckInvoicesCount: 1 })).toBe(false)
  })

  it('is not quiet when hasWeeklySavings is true, even with every count zero', () => {
    expect(isQuietDay(allZero, true)).toBe(false)
  })

  it('defaults hasWeeklySavings to false — unchanged behavior for every existing call site', () => {
    expect(isQuietDay(allZero)).toBe(true)
  })
})

describe('estimateDollarsFromKm', () => {
  it('matches src/utils.js\'s own estimate for the same input', () => {
    expect(estimateDollarsFromKm(100)).toBe(91)
  })

  it('rounds to the nearest dollar', () => {
    expect(estimateDollarsFromKm(1)).toBe(1) // 0.91 rounds up
    expect(estimateDollarsFromKm(0.4)).toBe(0) // 0.364 rounds down
  })

  it('treats null/undefined/non-numeric as zero', () => {
    expect(estimateDollarsFromKm(null)).toBe(0)
    expect(estimateDollarsFromKm(undefined)).toBe(0)
  })
})

describe('isWeeklySavingsDay', () => {
  it('is true for a Monday in the given timezone', () => {
    // 2026-10-18 22:00 UTC — this cron's own fire time — is still Sunday
    // in UTC but already Monday in Sydney (UTC+11 AEDT in October), the
    // exact mismatch this function exists to get right.
    expect(isWeeklySavingsDay(new Date('2026-10-18T22:00:00Z'), 'Australia/Sydney')).toBe(true)
  })

  it('is false for the same instant read as UTC (demonstrates the bug this avoids)', () => {
    expect(isWeeklySavingsDay(new Date('2026-10-18T22:00:00Z'), 'UTC')).toBe(false)
  })

  it('is false for a non-Monday', () => {
    expect(isWeeklySavingsDay(new Date('2026-10-19T22:00:00Z'), 'Australia/Sydney')).toBe(false)
  })
})
