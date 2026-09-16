import { describe, it, expect } from 'vitest'
import { computeDaysOverdue, summarizeJobDescription, selectTonePrompt, isDraftUsable } from './logic'

describe('computeDaysOverdue', () => {
  it('returns 0 for an invoice created right now', () => {
    expect(computeDaysOverdue(new Date().toISOString())).toBe(0)
  })
  it('returns 3 for an invoice created exactly 3 days ago', () => {
    const now = Date.now()
    const createdAt = new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeDaysOverdue(createdAt, now)).toBe(3)
  })
  it('floors partial days', () => {
    const now = Date.now()
    const createdAt = new Date(now - 3.9 * 24 * 60 * 60 * 1000).toISOString()
    expect(computeDaysOverdue(createdAt, now)).toBe(3)
  })
})

describe('summarizeJobDescription', () => {
  it('returns an empty string for non-array input', () => {
    expect(summarizeJobDescription(null)).toBe('')
    expect(summarizeJobDescription(undefined)).toBe('')
  })
  it('joins descriptions with a comma', () => {
    expect(summarizeJobDescription([{ description: 'Fix tap' }, { description: 'Replace valve' }])).toBe('Fix tap, Replace valve')
  })
  it('drops empty/missing descriptions', () => {
    expect(summarizeJobDescription([{ description: 'Fix tap' }, {}, { description: '' }])).toBe('Fix tap')
  })
  it('returns an empty string for an empty array', () => {
    expect(summarizeJobDescription([])).toBe('')
  })
})

describe('selectTonePrompt', () => {
  it('is friendly for the first reminder', () => {
    expect(selectTonePrompt(0)).toContain('first reminder')
  })
  it('is a bit more direct for the second reminder', () => {
    expect(selectTonePrompt(1)).toContain('2nd reminder')
  })
  it('is firmer from the third reminder onward', () => {
    expect(selectTonePrompt(2)).toContain('3rd reminder')
    expect(selectTonePrompt(5)).toContain('3rd reminder')
  })
})

describe('isDraftUsable', () => {
  const link = 'https://app.example.com/invoice/123'
  const amount = '150.00'

  it('accepts a draft containing both the link and amount within length', () => {
    expect(isDraftUsable(`Hi! Your invoice for $${amount} is due: ${link}`, link, amount)).toBe(true)
  })
  it('rejects an empty draft', () => {
    expect(isDraftUsable('', link, amount)).toBe(false)
  })
  it('rejects a draft missing the link', () => {
    expect(isDraftUsable(`Your invoice for $${amount} is due.`, link, amount)).toBe(false)
  })
  it('rejects a draft missing the amount', () => {
    expect(isDraftUsable(`Your invoice is due: ${link}`, link, amount)).toBe(false)
  })
  it('rejects a draft over 320 characters', () => {
    expect(isDraftUsable(`${link} $${amount} ` + 'x'.repeat(320), link, amount)).toBe(false)
  })
})
