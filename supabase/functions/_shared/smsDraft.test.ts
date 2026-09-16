import { describe, it, expect } from 'vitest'
import { isPlainDraftUsable } from './smsDraft'

describe('isPlainDraftUsable', () => {
  it('rejects an empty string', () => { expect(isPlainDraftUsable('')).toBe(false) })
  it('accepts a short draft under the default 300-char limit', () => { expect(isPlainDraftUsable('Hi there!')).toBe(true) })
  it('rejects a draft over the default 300-char limit', () => { expect(isPlainDraftUsable('x'.repeat(301))).toBe(false) })
  it('accepts a draft exactly at the limit', () => { expect(isPlainDraftUsable('x'.repeat(300))).toBe(true) })
  it('respects a custom max length', () => {
    expect(isPlainDraftUsable('x'.repeat(50), 40)).toBe(false)
    expect(isPlainDraftUsable('x'.repeat(40), 40)).toBe(true)
  })
})
