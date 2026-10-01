import { describe, it, expect } from 'vitest'
import {
  computeLocalQuantity,
  isMismatch,
  buildMismatchSlackMessage,
  buildMismatchFallbackSummary,
  buildReasoningPrompt,
  findStaleAddonItems,
  buildAddonDriftSlackMessage,
  buildAddonDriftFallbackSummary,
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

describe('findStaleAddonItems', () => {
  it('returns an empty array for null/undefined storedItems', () => {
    expect(findStaleAddonItems(null, new Set())).toEqual([])
    expect(findStaleAddonItems(undefined, new Set())).toEqual([])
  })

  it('returns an empty array when every stored item id is still live', () => {
    const storedItems = { ai_quotes: 'si_1', crew_splitting: 'si_2' }
    const live = new Set(['si_1', 'si_2', 'si_3'])
    expect(findStaleAddonItems(storedItems, live)).toEqual([])
  })

  it('flags keys whose stored item id is no longer live', () => {
    const storedItems = { ai_quotes: 'si_1', crew_splitting: 'si_dead' }
    const live = new Set(['si_1'])
    expect(findStaleAddonItems(storedItems, live)).toEqual(['crew_splitting'])
  })

  it('flags every key when none are live', () => {
    const storedItems = { ai_quotes: 'si_dead1', crew_splitting: 'si_dead2' }
    expect(findStaleAddonItems(storedItems, new Set())).toEqual(['ai_quotes', 'crew_splitting'])
  })
})

describe('buildAddonDriftSlackMessage', () => {
  it('includes the business name and the stale addon keys', () => {
    const msg = buildAddonDriftSlackMessage('Acme Plumbing', ['ai_quotes', 'crew_splitting'])
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('ai_quotes, crew_splitting')
  })
})

describe('buildAddonDriftFallbackSummary', () => {
  it('includes the business name and the stale addon keys', () => {
    const summary = buildAddonDriftFallbackSummary('Acme Plumbing', ['ai_quotes'])
    expect(summary).toContain('Acme Plumbing')
    expect(summary).toContain('[ai_quotes]')
  })
})
