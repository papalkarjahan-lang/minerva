import { describe, it, expect } from 'vitest'
import { shouldAllowCheckoutCreation, isTierAvailableForSector, priceEnvKeyFor } from './logic'

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

describe('isTierAvailableForSector (smoke test — moved to ../_shared/tierEligibility.ts, full coverage lives in its own test file there)', () => {
  it('re-exports a working function', () => {
    expect(isTierAvailableForSector('pro', 'industrial')).toBe(false)
    expect(isTierAvailableForSector('pro', 'trade')).toBe(true)
  })
})

describe('priceEnvKeyFor', () => {
  it('picks the monthly key for each tier when no cycle (or "monthly") is given', () => {
    expect(priceEnvKeyFor('starter', 'monthly')).toBe('STRIPE_PRICE_ID_STARTER')
    expect(priceEnvKeyFor('standard', 'monthly')).toBe('STRIPE_PRICE_ID_STD')
    expect(priceEnvKeyFor('pro', 'monthly')).toBe('STRIPE_PRICE_ID_PRO')
    expect(priceEnvKeyFor('starter', null)).toBe('STRIPE_PRICE_ID_STARTER')
    expect(priceEnvKeyFor('starter', undefined)).toBe('STRIPE_PRICE_ID_STARTER')
  })

  it('picks the annual key for each tier when billingCycle is "annual"', () => {
    expect(priceEnvKeyFor('starter', 'annual')).toBe('STRIPE_PRICE_ID_STARTER_ANNUAL')
    expect(priceEnvKeyFor('standard', 'annual')).toBe('STRIPE_PRICE_ID_STD_ANNUAL')
    expect(priceEnvKeyFor('pro', 'annual')).toBe('STRIPE_PRICE_ID_PRO_ANNUAL')
  })

  it('defaults an unrecognised or missing tier to Standard, same as the monthly-only behavior this replaces', () => {
    expect(priceEnvKeyFor('bogus-tier', 'monthly')).toBe('STRIPE_PRICE_ID_STD')
    expect(priceEnvKeyFor(null, 'monthly')).toBe('STRIPE_PRICE_ID_STD')
    expect(priceEnvKeyFor(undefined, 'annual')).toBe('STRIPE_PRICE_ID_STD_ANNUAL')
  })

  it('treats any non-"annual" value as monthly, rather than erroring or guessing', () => {
    expect(priceEnvKeyFor('pro', 'bogus-cycle')).toBe('STRIPE_PRICE_ID_PRO')
    expect(priceEnvKeyFor('pro', '')).toBe('STRIPE_PRICE_ID_PRO')
  })
})
