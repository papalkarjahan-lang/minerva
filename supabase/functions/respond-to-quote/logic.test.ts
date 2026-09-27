import { describe, it, expect } from 'vitest'
import { isValidResponseStatus, canRespond } from './logic'

describe('isValidResponseStatus', () => {
  it('accepts "accepted"', () => { expect(isValidResponseStatus('accepted')).toBe(true) })
  it('accepts "declined"', () => { expect(isValidResponseStatus('declined')).toBe(true) })
  it('rejects "draft"', () => { expect(isValidResponseStatus('draft')).toBe(false) })
  it('rejects "sent"', () => { expect(isValidResponseStatus('sent')).toBe(false) })
  it('rejects an arbitrary string', () => { expect(isValidResponseStatus('lol')).toBe(false) })
  it('rejects null', () => { expect(isValidResponseStatus(null)).toBe(false) })
  it('rejects empty string', () => { expect(isValidResponseStatus('')).toBe(false) })
})

describe('canRespond', () => {
  it('allows responding when status is "sent"', () => { expect(canRespond('sent')).toBe(true) })
  it('does not allow responding to a draft', () => { expect(canRespond('draft')).toBe(false) })
  it('does not allow responding twice (already accepted)', () => { expect(canRespond('accepted')).toBe(false) })
  it('does not allow responding twice (already declined)', () => { expect(canRespond('declined')).toBe(false) })
  it('does not allow responding when status is null', () => { expect(canRespond(null)).toBe(false) })
})
