import { describe, it, expect } from 'vitest'
import { isValidRating, canSubmitRating } from './logic'

describe('isValidRating', () => {
  it('accepts the two real rating values', () => {
    expect(isValidRating('good')).toBe(true)
    expect(isValidRating('not_great')).toBe(true)
  })
  it('rejects anything else, including null', () => {
    expect(isValidRating('excellent')).toBe(false)
    expect(isValidRating('')).toBe(false)
    expect(isValidRating(null)).toBe(false)
  })
})

describe('canSubmitRating', () => {
  it('allows a rating on a complete job with no existing rating', () => {
    expect(canSubmitRating('complete', null)).toBe(true)
  })
  it('refuses a job that is not yet complete', () => {
    expect(canSubmitRating('scheduled', null)).toBe(false)
    expect(canSubmitRating('active', null)).toBe(false)
  })
  it('refuses a job that already has a rating (no changing your mind via a replayed link)', () => {
    expect(canSubmitRating('complete', 'good')).toBe(false)
    expect(canSubmitRating('complete', 'not_great')).toBe(false)
  })
})
