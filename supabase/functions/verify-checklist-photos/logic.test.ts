import { describe, it, expect } from 'vitest'
import { parseReviewResponse, shouldMarkJobVerified } from './logic'

describe('parseReviewResponse', () => {
  it('parses a well-formed pass response', () => {
    expect(parseReviewResponse('STATUS: pass | NOTES: Photo clearly shows the completed item.')).toEqual({
      status: 'pass',
      notes: 'Photo clearly shows the completed item.',
    })
  })

  it('parses a well-formed flagged response', () => {
    expect(parseReviewResponse('STATUS: flagged | NOTES: Photo is blank.')).toEqual({
      status: 'flagged',
      notes: 'Photo is blank.',
    })
  })

  it('is case-insensitive on STATUS/NOTES keywords and values', () => {
    expect(parseReviewResponse('status: PASS | notes: looks fine')).toEqual({
      status: 'pass',
      notes: 'looks fine',
    })
  })

  it('falls back to unavailable when STATUS is missing entirely', () => {
    const result = parseReviewResponse('The photo looks okay I guess.')
    expect(result.status).toBe('unavailable')
    expect(result.notes).toContain("didn't match expected format")
  })

  it('falls back to unavailable on an empty response', () => {
    const result = parseReviewResponse('')
    expect(result.status).toBe('unavailable')
  })

  it('never returns pass for an unparseable response (must not silently look reviewed)', () => {
    const result = parseReviewResponse('lorem ipsum nonsense output')
    expect(result.status).not.toBe('pass')
  })

  it('uses the raw text (truncated) as notes when STATUS matches but NOTES is missing', () => {
    const result = parseReviewResponse('STATUS: pass')
    expect(result.status).toBe('pass')
    expect(result.notes).toBe('STATUS: pass')
  })
})

describe('shouldMarkJobVerified', () => {
  it('returns false for an empty photo list', () => {
    expect(shouldMarkJobVerified([])).toBe(false)
  })

  it('returns true when every photo passed', () => {
    expect(shouldMarkJobVerified(['pass', 'pass', 'pass'])).toBe(true)
  })

  it('returns false if any photo is still pending', () => {
    expect(shouldMarkJobVerified(['pass', 'pending'])).toBe(false)
  })

  it('returns false if any photo is flagged', () => {
    expect(shouldMarkJobVerified(['pass', 'flagged'])).toBe(false)
  })

  it('returns false if any photo is unavailable (never actually reviewed)', () => {
    expect(shouldMarkJobVerified(['pass', 'unavailable'])).toBe(false)
  })

  it('returns true for a single passed photo', () => {
    expect(shouldMarkJobVerified(['pass'])).toBe(true)
  })
})
