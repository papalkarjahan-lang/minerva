import { describe, it, expect } from 'vitest'
import {
  clampScore, detectEmergency, detectValueTier, computeTemplateScore,
  extractReferralCode, runTemplateIntake, applyRepeatClientBoost, cleanUtm,
} from './logic'

describe('clampScore', () => {
  it('clamps below 0 up to 0', () => { expect(clampScore(-10)).toBe(0) })
  it('clamps above 100 down to 100', () => { expect(clampScore(150)).toBe(100) })
  it('leaves an in-range score untouched', () => { expect(clampScore(42)).toBe(42) })
})

describe('detectEmergency', () => {
  it('detects an emergency keyword', () => { expect(detectEmergency('the pipe burst everywhere')).toBe(true) })
  it('detects the word urgent as a whole word', () => { expect(detectEmergency('this is urgent please')).toBe(true) })
  it('is false for a routine description', () => { expect(detectEmergency('just need a quote sometime next week')).toBe(false) })
  it('is false when urgency is explicitly negated ("not urgent")', () => { expect(detectEmergency('no it is not urgent')).toBe(false) })
  it('is false for "no rush"', () => { expect(detectEmergency('no rush, no rush at all')).toBe(false) })
  it('is false for "can wait"', () => { expect(detectEmergency('this can wait until next week')).toBe(false) })
  it('is false for "not an emergency"', () => { expect(detectEmergency('not an emergency, just routine maintenance')).toBe(false) })
})

describe('detectValueTier', () => {
  it('returns high for renovation-type language', () => { expect(detectValueTier('full bathroom renovation')).toBe('high') })
  it('returns low for a leaky tap', () => { expect(detectValueTier('just a leaky tap')).toBe('low') })
  it('returns medium when neither high nor low keywords match', () => { expect(detectValueTier('something is broken')).toBe('medium') })
  it('prefers high over low when both keyword sets are present', () => { expect(detectValueTier('quick full rewire')).toBe('high') })
})

describe('computeTemplateScore', () => {
  it('scores an emergency higher than a routine job', () => {
    expect(computeTemplateScore(true, 10, false)).toBe(75)
    expect(computeTemplateScore(false, 10, false)).toBe(50)
  })
  it('adds 10 for a long job description', () => { expect(computeTemplateScore(false, 61, false)).toBe(60) })
  it('adds 10 for high-value keywords', () => { expect(computeTemplateScore(false, 10, true)).toBe(60) })
  it('stacks all bonuses and clamps at 100', () => { expect(computeTemplateScore(true, 100, true)).toBe(95) })
})

describe('extractReferralCode', () => {
  it('returns null when no message mentions a referral', () => {
    expect(extractReferralCode(['just need a plumber', 'ASAP please'])).toBeNull()
  })
  it('extracts a real 6-character code from a referral-flavored message', () => {
    expect(extractReferralCode(['my mate said to use code AB23CD'])).toBe('AB23CD')
  })
  it('does not false-positive on an ordinary word that happens to be 6 letters', () => {
    // "FRIEND" contains an 'I', which the real code alphabet excludes.
    expect(extractReferralCode(['a friend said you were great'])).toBeNull()
  })
  it('does not false-positive on a short ordinary word like "mate"', () => {
    expect(extractReferralCode(['my mate said this place is great'])).toBeNull()
  })
})

describe('runTemplateIntake', () => {
  const business = { name: 'Acme Plumbing', trade_type: 'plumbing', city: 'Sydney' }

  it('asks the first question when no user turns exist yet', () => {
    const result = runTemplateIntake(business, [])
    expect(result.lead_captured).toBe(false)
    expect(result.reply).toContain('Acme Plumbing')
  })

  it('walks through the fixed field order one at a time', () => {
    const msgs = (contents: string[]) => contents.map(c => ({ role: 'user' as const, content: c }))
    expect(runTemplateIntake(business, msgs(['leaky tap'])).reply).toContain('urgent right now')
    expect(runTemplateIntake(business, msgs(['leaky tap', 'no rush'])).reply).toContain('grab your name')
    expect(runTemplateIntake(business, msgs(['leaky tap', 'no rush', 'Jane Smith'])).reply).toContain('phone number')
    expect(runTemplateIntake(business, msgs(['leaky tap', 'no rush', 'Jane Smith', '0412345678'])).reply).toContain('suburb')
  })

  it('captures a lead once all five fields are answered', () => {
    const msgs = ['full bathroom renovation', 'sometime next week is fine', 'Jane Smith', '0412345678', 'Parramatta']
      .map(c => ({ role: 'user' as const, content: c }))
    const result = runTemplateIntake(business, msgs)
    expect(result.lead_captured).toBe(true)
    expect(result.lead).toMatchObject({
      name: 'Jane Smith', phone: '0412345678', suburb: 'Parramatta',
      urgency: 'routine', estimated_value_tier: 'high',
    })
  })

  it('correctly classifies "not urgent" as routine, not emergency', () => {
    const msgs = ['leaky tap', 'not urgent', 'Jane Smith', '0412345678', 'Parramatta']
      .map(c => ({ role: 'user' as const, content: c }))
    const result = runTemplateIntake(business, msgs)
    expect(result.lead?.urgency).toBe('routine')
  })

  it('treats emergency keywords as urgency=emergency and boosts the score', () => {
    const msgs = ['burst pipe flooding the kitchen', 'yes emergency', 'Jane Smith', '0412345678', 'Parramatta']
      .map(c => ({ role: 'user' as const, content: c }))
    const result = runTemplateIntake(business, msgs)
    expect(result.lead?.urgency).toBe('emergency')
    expect(result.lead?.score).toBeGreaterThanOrEqual(75)
  })
})

describe('applyRepeatClientBoost', () => {
  it('leaves score and reason unchanged for a non-repeat client', () => {
    expect(applyRepeatClientBoost(50, 'Template intake: routine.', false)).toEqual({ score: 50, scoreReason: 'Template intake: routine.' })
  })
  it('boosts score by 15 and appends the reason for a repeat client', () => {
    const result = applyRepeatClientBoost(50, 'Template intake: routine.', true)
    expect(result.score).toBe(65)
    expect(result.scoreReason).toContain('Returning client (+15)')
  })
  it('clamps the boosted score at 100', () => {
    expect(applyRepeatClientBoost(95, '', true).score).toBe(100)
  })
  it('uses a standalone reason when none was set', () => {
    expect(applyRepeatClientBoost(50, '', true).scoreReason).toBe('Returning client.')
  })
})

describe('cleanUtm', () => {
  it('returns null for undefined', () => { expect(cleanUtm(undefined)).toBeNull() })
  it('returns null for a blank string', () => { expect(cleanUtm('   ')).toBeNull() })
  it('trims whitespace', () => { expect(cleanUtm('  google  ')).toBe('google') })
  it('caps length at 100 characters', () => { expect(cleanUtm('x'.repeat(200))?.length).toBe(100) })
})
