import { describe, it, expect } from 'vitest'
import { computeInvoiceStats, isQuietDay } from './logic'

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
})
