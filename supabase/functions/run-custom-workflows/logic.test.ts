import { describe, it, expect } from 'vitest'
import { matchesCondition } from './logic'

describe('matchesCondition', () => {
  it('always matches when no field is set', () => {
    expect(matchesCondition({}, null, 'eq', 'x')).toBe(true)
  })

  it('always matches when no op is set', () => {
    expect(matchesCondition({ urgency: 'high' }, 'urgency', null, 'high')).toBe(true)
  })

  it('does not match when the field is missing from the payload', () => {
    expect(matchesCondition({}, 'urgency', 'eq', 'high')).toBe(false)
  })

  it('does not match when the field is explicitly null', () => {
    expect(matchesCondition({ urgency: null }, 'urgency', 'eq', 'high')).toBe(false)
  })

  describe('eq', () => {
    it('matches equal string values', () => { expect(matchesCondition({ status: 'lost' }, 'status', 'eq', 'lost')).toBe(true) })
    it('does not match unequal values', () => { expect(matchesCondition({ status: 'won' }, 'status', 'eq', 'lost')).toBe(false) })
    it('coerces numbers to strings for comparison', () => { expect(matchesCondition({ amount: 100 }, 'amount', 'eq', '100')).toBe(true) })
  })

  describe('neq', () => {
    it('matches when values differ', () => { expect(matchesCondition({ status: 'won' }, 'status', 'neq', 'lost')).toBe(true) })
    it('does not match when values are equal', () => { expect(matchesCondition({ status: 'lost' }, 'status', 'neq', 'lost')).toBe(false) })
  })

  describe('gt', () => {
    it('matches when actual is greater', () => { expect(matchesCondition({ amount: 500 }, 'amount', 'gt', '100')).toBe(true) })
    it('does not match when actual is not greater', () => { expect(matchesCondition({ amount: 50 }, 'amount', 'gt', '100')).toBe(false) })
  })

  describe('lt', () => {
    it('matches when actual is less', () => { expect(matchesCondition({ amount: 50 }, 'amount', 'lt', '100')).toBe(true) })
    it('does not match when actual is not less', () => { expect(matchesCondition({ amount: 500 }, 'amount', 'lt', '100')).toBe(false) })
  })

  describe('contains', () => {
    it('matches a case-insensitive substring', () => { expect(matchesCondition({ notes: 'Urgent Job Here' }, 'notes', 'contains', 'urgent')).toBe(true) })
    it('does not match when substring is absent', () => { expect(matchesCondition({ notes: 'routine job' }, 'notes', 'contains', 'urgent')).toBe(false) })
  })

  it('defaults to matching (true) for an unrecognized operator', () => {
    expect(matchesCondition({ amount: 100 }, 'amount', 'unknown_op', '100')).toBe(true)
  })
})
