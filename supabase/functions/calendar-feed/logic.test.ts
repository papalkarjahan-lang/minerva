import { describe, it, expect } from 'vitest'
import { icsEscape, toIcsDate } from './logic'

describe('icsEscape', () => {
  it('escapes backslashes', () => { expect(icsEscape('a\\b')).toBe('a\\\\b') })
  it('escapes semicolons', () => { expect(icsEscape('a;b')).toBe('a\\;b') })
  it('escapes commas', () => { expect(icsEscape('a,b')).toBe('a\\,b') })
  it('escapes newlines', () => { expect(icsEscape('a\nb')).toBe('a\\nb') })
  it('handles empty/null/undefined input as empty string', () => {
    expect(icsEscape('')).toBe('')
    expect(icsEscape(null as unknown as string)).toBe('')
    expect(icsEscape(undefined as unknown as string)).toBe('')
  })
  it('leaves plain text unchanged', () => { expect(icsEscape('Plain job note')).toBe('Plain job note') })
})

describe('toIcsDate', () => {
  it('formats a UTC date as YYYYMMDDTHHMMSSZ', () => {
    expect(toIcsDate('2026-09-17T05:30:00.000Z')).toBe('20260917T053000Z')
  })
  it('strips milliseconds', () => {
    expect(toIcsDate('2026-01-01T00:00:00.123Z')).toBe('20260101T000000Z')
  })
  it('converts a non-UTC ISO string to UTC first', () => {
    // +11:00 offset -> subtract 11h to get UTC
    expect(toIcsDate('2026-06-15T10:00:00.000+11:00')).toBe('20260614T230000Z')
  })
})
