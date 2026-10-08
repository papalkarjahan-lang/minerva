import { describe, it, expect } from 'vitest'
import { shouldAllowCheckoutCreation, isTierAvailableForSector } from './logic'

describe('shouldAllowCheckoutCreation', () => {
  it('allows when the provided token matches the stored one', () => {
    expect(shouldAllowCheckoutCreation('abc-123', 'abc-123')).toBe(true)
  })

  it('rejects a mismatched token', () => {
    expect(shouldAllowCheckoutCreation('abc-123', 'wrong-guess')).toBe(false)
  })

  it('rejects when no token was provided at all', () => {
    expect(shouldAllowCheckoutCreation('abc-123', null)).toBe(false)
    expect(shouldAllowCheckoutCreation('abc-123', undefined)).toBe(false)
    expect(shouldAllowCheckoutCreation('abc-123', '')).toBe(false)
  })

  it('rejects a null/empty provided token against a legacy null-stored row, rather than matching null to null', () => {
    // The exact bypass this guard exists to close: a business row created
    // before this column existed has a genuinely null checkout_token. A
    // naive storedToken === providedToken check alone would let null
    // match null and let anyone through for every such row.
    expect(shouldAllowCheckoutCreation(null, null)).toBe(false)
    expect(shouldAllowCheckoutCreation(null, undefined)).toBe(false)
    expect(shouldAllowCheckoutCreation(undefined, null)).toBe(false)
  })

  it('rejects any guessed token against a legacy null-stored row', () => {
    expect(shouldAllowCheckoutCreation(null, 'some-guess')).toBe(false)
  })

  it('rejects when the business was not found at all (storedToken undefined)', () => {
    expect(shouldAllowCheckoutCreation(undefined, 'some-guess')).toBe(false)
  })
})

describe('isTierAvailableForSector', () => {
  it('rejects pro for industrial — none of Pro\'s 6 marketed features exist for that sector', () => {
    expect(isTierAvailableForSector('pro', 'industrial')).toBe(false)
  })

  it('allows pro for trade', () => {
    expect(isTierAvailableForSector('pro', 'trade')).toBe(true)
  })

  it('allows starter and standard for either sector', () => {
    expect(isTierAvailableForSector('starter', 'industrial')).toBe(true)
    expect(isTierAvailableForSector('standard', 'industrial')).toBe(true)
    expect(isTierAvailableForSector('starter', 'trade')).toBe(true)
    expect(isTierAvailableForSector('standard', 'trade')).toBe(true)
  })

  it('allows an unrecognised tier through — create-checkout-session already defaults that to Standard pricing, not a Pro charge', () => {
    expect(isTierAvailableForSector('not_a_real_tier', 'industrial')).toBe(true)
  })

  it('allows pro when sector is null/undefined (a pre-sector-column legacy row, if any) — only an explicit industrial match is rejected', () => {
    expect(isTierAvailableForSector('pro', null)).toBe(true)
    expect(isTierAvailableForSector('pro', undefined)).toBe(true)
  })
})
