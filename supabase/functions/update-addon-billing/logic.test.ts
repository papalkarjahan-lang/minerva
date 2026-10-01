import { describe, it, expect } from 'vitest'
import {
  addonPriceEnvVar,
  isValidAction,
  existingStripeItemId,
  buildEnabledPatch,
  buildEnabledNoopPatch,
  buildDisabledPatch,
} from './logic'

describe('addonPriceEnvVar', () => {
  it('upper-cases the addon key into the expected env var name', () => {
    expect(addonPriceEnvVar('ai_quotes')).toBe('STRIPE_PRICE_ID_ADDON_AI_QUOTES')
  })

  it('works for a single-word key', () => {
    expect(addonPriceEnvVar('xero_sync')).toBe('STRIPE_PRICE_ID_ADDON_XERO_SYNC')
  })
})

describe('isValidAction', () => {
  it('accepts "enable" and "disable"', () => {
    expect(isValidAction('enable')).toBe(true)
    expect(isValidAction('disable')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isValidAction('toggle')).toBe(false)
    expect(isValidAction(undefined)).toBe(false)
    expect(isValidAction(null)).toBe(false)
    expect(isValidAction(1)).toBe(false)
  })
})

describe('existingStripeItemId', () => {
  it('returns null for a null/undefined business', () => {
    expect(existingStripeItemId(null, 'ai_quotes')).toBe(null)
    expect(existingStripeItemId(undefined, 'ai_quotes')).toBe(null)
  })

  it('returns null when the addon has no stored item id', () => {
    expect(existingStripeItemId({ max_addon_stripe_items: {} }, 'ai_quotes')).toBe(null)
  })

  it('returns the stored item id when present', () => {
    expect(existingStripeItemId({ max_addon_stripe_items: { ai_quotes: 'si_123' } }, 'ai_quotes')).toBe('si_123')
  })
})

describe('buildEnabledPatch', () => {
  it('sets the flag true and records the new item id', () => {
    const patch = buildEnabledPatch({ max_addons: { crew_splitting: true }, max_addon_stripe_items: { crew_splitting: 'si_old' } }, 'ai_quotes', 'si_new')
    expect(patch).toEqual({
      max_addons: { crew_splitting: true, ai_quotes: true },
      max_addon_stripe_items: { crew_splitting: 'si_old', ai_quotes: 'si_new' },
    })
  })

  it('handles a business with no prior addon state', () => {
    const patch = buildEnabledPatch(null, 'ai_quotes', 'si_new')
    expect(patch).toEqual({
      max_addons: { ai_quotes: true },
      max_addon_stripe_items: { ai_quotes: 'si_new' },
    })
  })
})

describe('buildEnabledNoopPatch', () => {
  it('only sets the flag, leaving max_addon_stripe_items untouched by this patch', () => {
    const patch = buildEnabledNoopPatch({ max_addons: { ai_quotes: false } }, 'ai_quotes')
    expect(patch).toEqual({ max_addons: { ai_quotes: true } })
  })
})

describe('buildDisabledPatch', () => {
  it('sets the flag false and removes the stored item id', () => {
    const patch = buildDisabledPatch({ max_addons: { ai_quotes: true }, max_addon_stripe_items: { ai_quotes: 'si_123', crew_splitting: 'si_456' } }, 'ai_quotes')
    expect(patch).toEqual({
      max_addons: { ai_quotes: false },
      max_addon_stripe_items: { crew_splitting: 'si_456' },
    })
  })

  it('is a no-op removal when there was never a stored item id', () => {
    const patch = buildDisabledPatch({ max_addons: { ai_quotes: true } }, 'ai_quotes')
    expect(patch).toEqual({
      max_addons: { ai_quotes: false },
      max_addon_stripe_items: {},
    })
  })
})
