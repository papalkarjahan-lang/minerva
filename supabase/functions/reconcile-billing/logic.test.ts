import { describe, it, expect } from 'vitest'
import {
  computeLocalQuantity,
  isMismatch,
  buildMismatchSlackMessage,
  buildMismatchFallbackSummary,
  buildReasoningPrompt,
} from './logic'

describe('computeLocalQuantity', () => {
  it('returns the count when positive', () => { expect(computeLocalQuantity(3)).toBe(3) })
  it('floors at 1 when count is 0', () => { expect(computeLocalQuantity(0)).toBe(1) })
  it('floors at 1 when count is null', () => { expect(computeLocalQuantity(null)).toBe(1) })
})

describe('isMismatch', () => {
  it('is false when stripeQuantity is null (lookup failed/unknown)', () => { expect(isMismatch(null, 3)).toBe(false) })
  it('is false when quantities match', () => { expect(isMismatch(3, 3)).toBe(false) })
  it('is true when stripe is higher than local', () => { expect(isMismatch(5, 3)).toBe(true) })
  it('is true when stripe is lower than local', () => { expect(isMismatch(2, 3)).toBe(true) })
})

describe('buildMismatchSlackMessage', () => {
  it('includes business name and both quantities', () => {
    const msg = buildMismatchSlackMessage('Acme Plumbing', 5, 3)
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('5 technician(s)')
    expect(msg).toContain('3 are actually connected')
  })
})

describe('buildMismatchFallbackSummary', () => {
  it('includes business name and both quantities', () => {
    const summary = buildMismatchFallbackSummary('Acme Plumbing', 5, 3)
    expect(summary).toContain('Acme Plumbing')
    expect(summary).toContain('(5)')
    expect(summary).toContain('(3)')
  })
})

describe('buildReasoningPrompt', () => {
  it('describes stripe higher than local correctly', () => {
    const prompt = buildReasoningPrompt('Acme Plumbing', 5, 3)
    expect(prompt).toContain('higher than local by 2')
  })

  it('describes stripe lower than local correctly', () => {
    const prompt = buildReasoningPrompt('Acme Plumbing', 2, 3)
    expect(prompt).toContain('lower than local by 1')
  })
})
