import { describe, it, expect } from 'vitest'
import { extractSuburb, rankSuburbsByJobCount } from './suburbs'

describe('extractSuburb', () => {
  it('returns null for a missing address', () => {
    expect(extractSuburb(null)).toBeNull()
    expect(extractSuburb(undefined)).toBeNull()
  })

  it('returns null for a blank address', () => {
    expect(extractSuburb('')).toBeNull()
  })

  it('strips a trailing state+postcode from the last comma segment (no comma before the state)', () => {
    expect(extractSuburb('12 Main St, Parramatta NSW 2150')).toBe('Parramatta')
  })

  it('is case-insensitive on the state abbreviation', () => {
    expect(extractSuburb('12 Main St, Bondi nsw 2026')).toBe('Bondi')
  })

  it('falls back to the second-to-last segment when the last one is only a state+postcode (comma before the state too)', () => {
    expect(extractSuburb('12 Main St, Parramatta, NSW 2150')).toBe('Parramatta')
  })

  it('falls back to the second-to-last segment when the last one is a bare postcode with no state', () => {
    expect(extractSuburb('12 Main St, Parramatta, 2150')).toBe('Parramatta')
  })

  it('takes the last comma-separated segment as-is when it is just the suburb', () => {
    expect(extractSuburb('1 A St, Parramatta')).toBe('Parramatta')
  })

  it('returns the whole trimmed address when there is no comma', () => {
    expect(extractSuburb('Parramatta')).toBe('Parramatta')
  })

  it('returns null when the trailing segment is empty (e.g. a trailing comma)', () => {
    expect(extractSuburb('12 Main St,')).toBeNull()
  })

  it('does not strip a bare state with no postcode (documented remaining gap)', () => {
    expect(extractSuburb('12 Main St, Parramatta NSW')).toBe('Parramatta NSW')
  })
})

describe('rankSuburbsByJobCount', () => {
  it('returns an empty array for no jobs', () => {
    expect(rankSuburbsByJobCount([])).toEqual([])
  })

  it('skips jobs with no usable address', () => {
    const result = rankSuburbsByJobCount([{ client_address: null }, { client_address: '' }])
    expect(result).toEqual([])
  })

  it('counts and ranks suburbs by job count, descending', () => {
    const jobs = [
      { client_address: '1 A St, Parramatta' },
      { client_address: '2 B St, Bondi' },
      { client_address: '3 C St, Parramatta' },
      { client_address: '4 D St, Parramatta' },
    ]
    const result = rankSuburbsByJobCount(jobs)
    expect(result[0]).toEqual(['Parramatta', 3])
    expect(result[1]).toEqual(['Bondi', 1])
  })
})
