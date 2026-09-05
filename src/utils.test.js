import { describe, it, expect } from 'vitest'
import { haversineKm, generatePin, generateReferralCode, timeAgo, insertTechniciansWithPinRetry } from './utils'

describe('haversineKm', () => {
  it('returns 0 for identical points', () => {
    expect(haversineKm(-33.87, 151.21, -33.87, 151.21)).toBeCloseTo(0, 5)
  })

  it('returns the known distance between Sydney and Melbourne (~713km)', () => {
    // Landmark-to-landmark great-circle distance, tolerant to ~10km since
    // this is just a sanity check on the formula, not a precise fixture.
    const km = haversineKm(-33.8688, 151.2093, -37.8136, 144.9631)
    expect(km).toBeGreaterThan(700)
    expect(km).toBeLessThan(720)
  })
})

describe('generatePin', () => {
  it('returns an 8-character string', () => {
    expect(generatePin()).toHaveLength(8)
  })

  it('only uses characters from the no-ambiguity alphabet', () => {
    const pin = generatePin()
    expect(pin).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/)
  })

  it('does not repeat across many calls (collision sanity check)', () => {
    const pins = new Set(Array.from({ length: 1000 }, () => generatePin()))
    expect(pins.size).toBe(1000)
  })
})

describe('generateReferralCode', () => {
  it('returns a 6-character string from the same alphabet', () => {
    const code = generateReferralCode()
    expect(code).toHaveLength(6)
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/)
  })
})

describe('timeAgo', () => {
  it('returns "never" for null/undefined', () => {
    expect(timeAgo(null)).toBe('never')
    expect(timeAgo(undefined)).toBe('never')
  })

  it('returns "just now" for a timestamp seconds ago', () => {
    expect(timeAgo(new Date(Date.now() - 5000).toISOString())).toBe('just now')
  })

  it('returns minutes for a timestamp under an hour old', () => {
    expect(timeAgo(new Date(Date.now() - 5 * 60 * 1000).toISOString())).toBe('5 mins ago')
  })

  it('returns hours for a timestamp under a day old', () => {
    expect(timeAgo(new Date(Date.now() - 3 * 3600 * 1000).toISOString())).toBe('3 hrs ago')
  })
})

describe('insertTechniciansWithPinRetry', () => {
  // Minimal fake of the chained supabase-js query builder shape this
  // function relies on: supabase.from(...).insert(...).select()
  function makeFakeSupabase(insertResults) {
    let call = 0
    return {
      from: () => ({
        insert: () => ({
          select: async () => insertResults[Math.min(call++, insertResults.length - 1)],
        }),
      }),
    }
  }

  it('returns data on first successful insert, assigning a pin to each row', async () => {
    const fakeRows = [{ business_id: 'b1', name: 'Alice' }]
    const supabase = makeFakeSupabase([{ data: [{ ...fakeRows[0], pin: 'X' }], error: null }])
    const { data, error } = await insertTechniciansWithPinRetry(supabase, fakeRows)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('retries on a unique_violation (23505) and eventually succeeds', async () => {
    const fakeRows = [{ business_id: 'b1', name: 'Alice' }]
    const supabase = makeFakeSupabase([
      { data: null, error: { code: '23505', message: 'duplicate key' } },
      { data: [{ ...fakeRows[0], pin: 'Y' }], error: null },
    ])
    const { data, error } = await insertTechniciansWithPinRetry(supabase, fakeRows)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it('does not retry on a non-collision error', async () => {
    let attempts = 0
    const supabase = {
      from: () => ({
        insert: () => ({
          select: async () => { attempts++; return { data: null, error: { code: '23503', message: 'fk violation' } } },
        }),
      }),
    }
    const { data, error } = await insertTechniciansWithPinRetry(supabase, [{ business_id: 'bad' }])
    expect(data).toBeNull()
    expect(error.code).toBe('23503')
    expect(attempts).toBe(1)
  })
})
