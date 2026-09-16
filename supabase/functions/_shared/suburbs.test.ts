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

  it('takes the last comma-separated segment, trimmed', () => {
    expect(extractSuburb('12 Main St, Parramatta NSW 2150')).toBe('Parramatta NSW 2150')
  })

  it('returns the whole trimmed address when there is no comma', () => {
    expect(extractSuburb('Parramatta')).toBe('Parramatta')
  })

  it('returns null when the trailing segment is empty (e.g. a trailing comma)', () => {
    expect(extractSuburb('12 Main St,')).toBeNull()
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
