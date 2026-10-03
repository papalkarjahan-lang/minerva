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
  it('does not false-positive on a word that merely contains a keyword as a substring', () => {
    // "smoked glass" contains "smoke", but isn't a gas/fire emergency.
    expect(detectEmergency('the smoked glass shower screen cracked')).toBe(false)
  })
  it('still matches a multi-word phrase keyword as a whole phrase', () => {
    expect(detectEmergency('no power in the whole house')).toBe(true)
  })
})

describe('detectValueTier', () => {
  it('returns high for renovation-type language', () => { expect(detectValueTier('full bathroom renovation')).toBe('high') })
  it('returns low for a leaky tap', () => { expect(detectValueTier('just a leaky tap')).toBe('low') })
  it('returns medium when neither high nor low keywords match', () => { expect(detectValueTier('something is broken')).toBe('medium') })
  it('prefers high over low when both keyword sets are present', () => { expect(detectValueTier('quick full rewire')).toBe('high') })
  it('does not false-positive on "fully" containing the keyword "full"', () => {
    expect(detectValueTier("I'm fully booked Thursday, can you come Friday instead?")).toBe('medium')
  })
  it('does not false-positive on "installment" containing the keyword "install"', () => {
    expect(detectValueTier('can I pay in installments?')).toBe('medium')
  })
  it('still matches "install" as its own whole word', () => {
    expect(detectValueTier('need a new install for the AC unit')).toBe('high')
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
