import { describe, it, expect } from 'vitest'
import { generateReferralCode, CODE_ALPHABET, shouldSkipForTier } from './logic'

describe('generateReferralCode', () => {
  it('generates a 6-character code', () => {
    expect(generateReferralCode().length).toBe(6)
  })

  it('only uses characters from the defined alphabet (no 0/O/1/I)', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateReferralCode()
      for (const ch of code) {
        expect(CODE_ALPHABET.includes(ch)).toBe(true)
      }
      expect(code).not.toMatch(/[01OI]/)
    }
  })

  it('produces varying codes across calls (not a constant)', () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateReferralCode()))
    expect(codes.size).toBeGreaterThan(1)
  })
})

describe('shouldSkipForTier', () => {
  it('skips pro tier (already has a working invoice-paid trigger)', () => {
    expect(shouldSkipForTier('pro')).toBe(true)
  })

  it('does not skip starter or standard', () => {
    expect(shouldSkipForTier('starter')).toBe(false)
    expect(shouldSkipForTier('standard')).toBe(false)
  })

  it('does not skip a missing/null tier (fails open, same as other tier reads in this project)', () => {
    expect(shouldSkipForTier(null)).toBe(false)
    expect(shouldSkipForTier(undefined)).toBe(false)
  })
})
