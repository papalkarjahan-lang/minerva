import { describe, it, expect } from 'vitest'
import { isAddonActive, isAddonAvailableForSector } from './maxAddons'

describe('isAddonActive', () => {
  it('is false for a null/undefined business', () => {
    expect(isAddonActive(null, 'ai_quotes')).toBe(false)
    expect(isAddonActive(undefined, 'ai_quotes')).toBe(false)
  })

  it('is true when the addon is permanently enabled', () => {
    expect(isAddonActive({ max_addons: { ai_quotes: true } }, 'ai_quotes')).toBe(true)
  })

  it('is false when the addon is explicitly disabled and there is no trial', () => {
    expect(isAddonActive({ max_addons: { ai_quotes: false } }, 'ai_quotes')).toBe(false)
  })

  it('is false when neither max_addons nor max_addon_trials mention the key', () => {
    expect(isAddonActive({}, 'ai_quotes')).toBe(false)
  })

  it('is true during an active trial', () => {
    const future = new Date(Date.now() + 60_000).toISOString()
    expect(isAddonActive({ max_addon_trials: { ai_quotes: { ends_at: future } } }, 'ai_quotes')).toBe(true)
  })

  it('is false once a trial has ended', () => {
    const past = new Date(Date.now() - 60_000).toISOString()
    expect(isAddonActive({ max_addon_trials: { ai_quotes: { ends_at: past } } }, 'ai_quotes')).toBe(false)
  })

  it('is false when the trial has no ends_at', () => {
    expect(isAddonActive({ max_addon_trials: { ai_quotes: {} } }, 'ai_quotes')).toBe(false)
  })

  it('checks only the requested key, ignoring other addons', () => {
    expect(isAddonActive({ max_addons: { xero_sync: true } }, 'ai_quotes')).toBe(false)
  })
})

describe('isAddonAvailableForSector', () => {
  it('allows asset_intelligence only for industrial', () => {
    expect(isAddonAvailableForSector('asset_intelligence', 'industrial')).toBe(true)
    expect(isAddonAvailableForSector('asset_intelligence', 'trade')).toBe(false)
  })

  it('allows ai_quotes only for trade — its backend keys off quotes/leads/invoices, which industrial never populates', () => {
    expect(isAddonAvailableForSector('ai_quotes', 'trade')).toBe(true)
    expect(isAddonAvailableForSector('ai_quotes', 'industrial')).toBe(false)
  })

  it('rejects asset_intelligence for a null/undefined sector, same as any other mismatch', () => {
    expect(isAddonAvailableForSector('asset_intelligence', null)).toBe(false)
    expect(isAddonAvailableForSector('asset_intelligence', undefined)).toBe(false)
  })

  it('rejects a trade-only addon for a null/undefined sector too', () => {
    expect(isAddonAvailableForSector('xero_sync', null)).toBe(false)
    expect(isAddonAvailableForSector('xero_sync', undefined)).toBe(false)
  })

  it('allows every other trade-only addon for trade and rejects it for industrial', () => {
    const tradeOnlyKeys = ['surge_pricing', 'crew_splitting', 'review_loop', 'demand_forecast', 'subcontractor_pool', 'carbon_estimate', 'xero_sync']
    for (const key of tradeOnlyKeys) {
      expect(isAddonAvailableForSector(key, 'trade')).toBe(true)
      expect(isAddonAvailableForSector(key, 'industrial')).toBe(false)
    }
  })

  it('passes an unknown addon key through as available for any sector — the true sector-neutral fallback', () => {
    expect(isAddonAvailableForSector('not_a_real_addon', 'trade')).toBe(true)
    expect(isAddonAvailableForSector('not_a_real_addon', 'industrial')).toBe(true)
    expect(isAddonAvailableForSector('not_a_real_addon', null)).toBe(true)
  })
})
