import { describe, it, expect } from 'vitest'
import { isOutreachEligible } from './outreachEligibility'

describe('isOutreachEligible', () => {
  it('is eligible when unsubscribed_at is null', () => {
    expect(isOutreachEligible({ unsubscribed_at: null })).toBe(true)
  })

  it('is eligible when unsubscribed_at is undefined (field not selected)', () => {
    expect(isOutreachEligible({})).toBe(true)
  })

  it('is NOT eligible once unsubscribed_at is set, regardless of value', () => {
    expect(isOutreachEligible({ unsubscribed_at: '2026-10-10T00:00:00.000Z' })).toBe(false)
  })

  it('is not eligible even for an unusual but truthy unsubscribed_at string', () => {
    expect(isOutreachEligible({ unsubscribed_at: '' })).toBe(true) // empty string is falsy — documents the exact boundary
    expect(isOutreachEligible({ unsubscribed_at: '0' })).toBe(false) // any non-empty string is treated as "set"
  })
})
