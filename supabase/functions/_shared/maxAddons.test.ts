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

  it('allows a sector-neutral addon for any sector, including null/undefined', () => {
    expect(isAddonAvailableForSector('ai_quotes', 'trade')).toBe(true)
    expect(isAddonAvailableForSector('ai_quotes', 'industrial')).toBe(true)
    expect(isAddonAvailableForSector('ai_quotes', null)).toBe(true)
    expect(isAddonAvailableForSector('ai_quotes', undefined)).toBe(true)
  })

  it('rejects asset_intelligence for a null/undefined sector, same as any other mismatch', () => {
    expect(isAddonAvailableForSector('asset_intelligence', null)).toBe(false)
    expect(isAddonAvailableForSector('asset_intelligence', undefined)).toBe(false)
  })
})
