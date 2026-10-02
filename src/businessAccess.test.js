import { describe, it, expect } from 'vitest'
import { isTrialExpired, SIGNUP_TRIAL_DAYS } from './businessAccess'

describe('isTrialExpired', () => {
  it('returns false for a null/undefined business', () => {
    expect(isTrialExpired(null)).toBe(false)
    expect(isTrialExpired(undefined)).toBe(false)
  })

  it('returns false once stripe_sub_id is set, no matter how old the business is', () => {
    const business = { stripe_sub_id: 'sub_123', created_at: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString() }
    expect(isTrialExpired(business)).toBe(false)
  })

  it('returns false when created_at is missing', () => {
    expect(isTrialExpired({ stripe_sub_id: null })).toBe(false)
  })

  it('returns false while still inside the trial window', () => {
    const business = { stripe_sub_id: null, created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString() }
    expect(isTrialExpired(business)).toBe(false)
  })

  it('returns false right at the moment of signup', () => {
    const business = { stripe_sub_id: null, created_at: new Date().toISOString() }
    expect(isTrialExpired(business)).toBe(false)
  })

  it('returns true once the trial window has passed with no stripe_sub_id', () => {
    const business = { stripe_sub_id: null, created_at: new Date(Date.now() - (SIGNUP_TRIAL_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString() }
    expect(isTrialExpired(business)).toBe(true)
  })

  it('treats an empty-string stripe_sub_id the same as unset', () => {
    const business = { stripe_sub_id: '', created_at: new Date(Date.now() - (SIGNUP_TRIAL_DAYS + 1) * 24 * 60 * 60 * 1000).toISOString() }
    expect(isTrialExpired(business)).toBe(true)
  })
})
