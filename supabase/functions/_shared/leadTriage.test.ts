import { describe, it, expect } from 'vitest'
import { clampScore, detectEmergency, detectValueTier, applyRepeatClientBoost } from './leadTriage'

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
