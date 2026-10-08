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

describe('extractSuburb — ReDoS guard', () => {
  // STATE_POSTCODE_SUFFIX has no start anchor, so a long non-matching
  // string with a large internal whitespace run makes the regex engine's
  // backtracking grow roughly quadratically — measured at ~1.9s for a
  // single ~50,000-character adversarial client_address, reachable from
  // the public intake chat widget and processed by daily-digest/
  // generate-growth-drafts' cron sweeps. Confirmed this isn't neutralized
  // by the .trim() already in extractSuburb, since trim only strips
  // leading/trailing whitespace, not an internal run.
  it('returns quickly (not null-by-luck) for a long address with a large internal whitespace run', () => {
    const evil = '123 Main St' + ' '.repeat(50000) + 'notarealstate'
    const start = Date.now()
    const result = extractSuburb(evil)
    const elapsedMs = Date.now() - start
    expect(elapsedMs).toBeLessThan(100) // was ~1900ms before the length guard
    expect(result).toBeNull() // too long to be a real suburb segment — same as "couldn't determine" elsewhere
  })

  it('still correctly extracts every legitimate address shape after the length guard', () => {
    expect(extractSuburb('12 Main St, Parramatta NSW 2150')).toBe('Parramatta')
    expect(extractSuburb('123 Main St, Parramatta, NSW 2150')).toBe('Parramatta')
    expect(extractSuburb('5 Beach Rd, Bondi')).toBe('Bondi')
  })

  it('does not reject a merely long but legitimate single-segment address', () => {
    // 150 chars — long but under the 200-char guard, must still process normally
    const longButLegit = 'A'.repeat(140) + ' NSW 2150'
    expect(extractSuburb(longButLegit)).toBe('A'.repeat(140))
  })
})
