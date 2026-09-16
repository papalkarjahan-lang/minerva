import { describe, it, expect } from 'vitest'
import { bucketJobsByAddress, findBestTrendingAddress, MIN_RECENT_COUNT } from './logic'

describe('bucketJobsByAddress', () => {
  const now = new Date('2026-01-29T00:00:00.000Z').getTime()

  it('skips jobs with a blank or missing address', () => {
    const buckets = bucketJobsByAddress([
      { client_address: '', created_at: new Date(now).toISOString() },
      { client_address: null, created_at: new Date(now).toISOString() },
    ], now)
    expect(Object.keys(buckets)).toEqual([])
  })

  it('buckets a job into "recent" when within the last 2 weeks', () => {
    const buckets = bucketJobsByAddress([
      { client_address: '1 Main St', created_at: new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString() },
    ], now)
    expect(buckets['1 Main St']).toEqual({ recent: 1, older: 0 })
  })

  it('buckets a job into "older" when more than 2 weeks ago', () => {
    const buckets = bucketJobsByAddress([
      { client_address: '1 Main St', created_at: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString() },
    ], now)
    expect(buckets['1 Main St']).toEqual({ recent: 0, older: 1 })
  })

  it('trims addresses so whitespace variants merge into one bucket', () => {
    const buckets = bucketJobsByAddress([
      { client_address: '1 Main St', created_at: new Date(now).toISOString() },
      { client_address: ' 1 Main St ', created_at: new Date(now).toISOString() },
    ], now)
    expect(buckets['1 Main St'].recent).toBe(2)
  })
})

describe('findBestTrendingAddress', () => {
  it('returns null when no address meets MIN_RECENT_COUNT', () => {
    const result = findBestTrendingAddress({ 'Addr A': { recent: MIN_RECENT_COUNT - 1, older: 0 } })
    expect(result).toBeNull()
  })

  it('returns null when the ratio is below the trend threshold', () => {
    const result = findBestTrendingAddress({ 'Addr A': { recent: 3, older: 3 } }) // ratio 1.0
    expect(result).toBeNull()
  })

  it('flags an address that meets both the count and ratio thresholds', () => {
    const result = findBestTrendingAddress({ 'Addr A': { recent: 4, older: 1 } }) // ratio 4.0
    expect(result?.addr).toBe('Addr A')
  })

  it('treats zero older jobs as 1 to avoid div-by-zero while staying conservative', () => {
    const result = findBestTrendingAddress({ 'Addr A': { recent: 3, older: 0 } }) // ratio 3/1 = 3.0
    expect(result?.ratio).toBe(3)
  })

  it('picks the address with the highest ratio among multiple qualifying addresses', () => {
    const result = findBestTrendingAddress({
      'Addr A': { recent: 4, older: 2 }, // ratio 2.0
      'Addr B': { recent: 6, older: 1 }, // ratio 6.0
    })
    expect(result?.addr).toBe('Addr B')
  })
})
