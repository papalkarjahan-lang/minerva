import { describe, it, expect } from 'vitest'
import {
  TRIAL_DAYS,
  MAX_ADDONS,
  getAddonMeta,
  hasAddon,
  isTrialing,
  trialDaysLeft,
  hasUsedTrial,
  enableAddonPatch,
  disableAddonPatch,
  startTrialPatch,
} from './maxAddons'

describe('getAddonMeta', () => {
  it('returns the matching catalog entry', () => {
    expect(getAddonMeta('xero_sync')?.name).toBe('Xero Sync')
  })

  it('returns null for an unknown key', () => {
    expect(getAddonMeta('not_a_real_addon')).toBeNull()
  })
})

describe('hasAddon', () => {
  it('returns false when business is null/undefined', () => {
    expect(hasAddon(null, 'ai_quotes')).toBe(false)
    expect(hasAddon(undefined, 'ai_quotes')).toBe(false)
  })

  it('returns true when the addon is enabled outright', () => {
    const business = { max_addons: { ai_quotes: true } }
    expect(hasAddon(business, 'ai_quotes')).toBe(true)
  })

  it('falls through to an active trial even when max_addons is explicitly false for that key', () => {
    const business = {
      max_addons: { ai_quotes: false },
      max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() + 86400000).toISOString() } },
    }
    // Only an exact `=== true` short-circuits to true; false falls through
    // to isTrialing, so a disabled-then-re-trialed addon still grants access.
    expect(hasAddon(business, 'ai_quotes')).toBe(true)
  })

  it('returns true while an addon trial is still active, with no max_addons flag at all', () => {
    const business = { max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() + 86400000).toISOString() } } }
    expect(hasAddon(business, 'ai_quotes')).toBe(true)
  })

  it('returns false once the trial has ended and the addon was never enabled', () => {
    const business = { max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() - 1000).toISOString() } } }
    expect(hasAddon(business, 'ai_quotes')).toBe(false)
  })

  it('returns false for an addon with neither a flag nor a trial', () => {
    expect(hasAddon({ max_addons: {} }, 'ai_quotes')).toBe(false)
  })
})

describe('isTrialing', () => {
  it('returns false when no trial exists for this key', () => {
    expect(isTrialing({ max_addon_trials: {} }, 'ai_quotes')).toBe(false)
    expect(isTrialing(null, 'ai_quotes')).toBe(false)
  })

  it('returns true when ends_at is in the future', () => {
    const business = { max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() + 60000).toISOString() } } }
    expect(isTrialing(business, 'ai_quotes')).toBe(true)
  })

  it('returns false when ends_at is in the past', () => {
    const business = { max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() - 60000).toISOString() } } }
    expect(isTrialing(business, 'ai_quotes')).toBe(false)
  })
})

describe('trialDaysLeft', () => {
  it('returns 0 when there is no trial', () => {
    expect(trialDaysLeft({ max_addon_trials: {} }, 'ai_quotes')).toBe(0)
  })

  it('returns 0 (never negative) once the trial has expired', () => {
    const business = { max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() - 86400000).toISOString() } } }
    expect(trialDaysLeft(business, 'ai_quotes')).toBe(0)
  })

  it('rounds up to the full TRIAL_DAYS right after starting', () => {
    const business = { max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString() } } }
    expect(trialDaysLeft(business, 'ai_quotes')).toBe(TRIAL_DAYS)
  })

  it('returns 1 day left with a few hours remaining (ceil, not floor)', () => {
    const business = { max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() + 3 * 3600000).toISOString() } } }
    expect(trialDaysLeft(business, 'ai_quotes')).toBe(1)
  })
})

describe('hasUsedTrial', () => {
  it('returns false when the key was never trialed', () => {
    expect(hasUsedTrial({ max_addon_trials: {} }, 'ai_quotes')).toBe(false)
    expect(hasUsedTrial(null, 'ai_quotes')).toBe(false)
  })

  it('returns true once a trial record exists, even after it has expired', () => {
    const business = { max_addon_trials: { ai_quotes: { ends_at: new Date(Date.now() - 86400000).toISOString() } } }
    expect(hasUsedTrial(business, 'ai_quotes')).toBe(true)
  })
})

describe('enableAddonPatch / disableAddonPatch', () => {
  it('enableAddonPatch sets only the given key true and preserves existing ones', () => {
    const business = { max_addons: { crew_splitting: true } }
    expect(enableAddonPatch(business, 'ai_quotes')).toEqual({
      max_addons: { crew_splitting: true, ai_quotes: true },
    })
  })

  it('enableAddonPatch works from a business with no max_addons yet', () => {
    expect(enableAddonPatch({}, 'ai_quotes')).toEqual({ max_addons: { ai_quotes: true } })
    expect(enableAddonPatch(null, 'ai_quotes')).toEqual({ max_addons: { ai_quotes: true } })
  })

  it('disableAddonPatch sets only the given key false and preserves existing ones', () => {
    const business = { max_addons: { ai_quotes: true, crew_splitting: true } }
    expect(disableAddonPatch(business, 'ai_quotes')).toEqual({
      max_addons: { ai_quotes: false, crew_splitting: true },
    })
  })
})

describe('startTrialPatch', () => {
  it('starts a trial that ends exactly TRIAL_DAYS later', () => {
    const patch = startTrialPatch({}, 'ai_quotes')
    const started = new Date(patch.max_addon_trials.ai_quotes.started_at).getTime()
    const ends = new Date(patch.max_addon_trials.ai_quotes.ends_at).getTime()
    expect(ends - started).toBe(TRIAL_DAYS * 24 * 60 * 60 * 1000)
  })

  it('preserves an existing trial for a different addon key', () => {
    const business = { max_addon_trials: { crew_splitting: { started_at: '2026-01-01T00:00:00.000Z', ends_at: '2026-01-31T00:00:00.000Z' } } }
    const patch = startTrialPatch(business, 'ai_quotes')
    expect(patch.max_addon_trials.crew_splitting).toEqual(business.max_addon_trials.crew_splitting)
    expect(patch.max_addon_trials.ai_quotes).toBeTruthy()
  })
})

describe('MAX_ADDONS catalog', () => {
  it('has a unique key for every entry', () => {
    const keys = MAX_ADDONS.map(a => a.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('gives every entry a positive price and a name', () => {
    for (const addon of MAX_ADDONS) {
      expect(addon.name).toBeTruthy()
      expect(addon.price).toBeGreaterThan(0)
    }
  })
})
