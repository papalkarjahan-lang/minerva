import { describe, it, expect } from 'vitest'
import { colorFor, parseAgentMessage, RED, AMBER, GREEN, AUBERGINE } from './logic'

describe('colorFor', () => {
  it('returns aubergine for no emoji', () => { expect(colorFor(null)).toBe(AUBERGINE) })
  it('returns red for the emergency emoji', () => { expect(colorFor('🚨')).toBe(RED) })
  it('returns amber for other urgent emojis', () => {
    expect(colorFor('⚠️')).toBe(AMBER)
    expect(colorFor('👻')).toBe(AMBER)
  })
  it('returns green for positive emojis', () => {
    expect(colorFor('💰')).toBe(GREEN)
    expect(colorFor('🤝')).toBe(GREEN)
    expect(colorFor('📈')).toBe(GREEN)
    expect(colorFor('✅')).toBe(GREEN)
  })
  it('returns aubergine for an unrecognized emoji', () => { expect(colorFor('🐸')).toBe(AUBERGINE) })
})

describe('parseAgentMessage', () => {
  it('parses the standard "<emoji> *Agent*: body" convention', () => {
    expect(parseAgentMessage('⏳ *nurture-stale-leads*: Nurture SMS sent.')).toEqual({
      emoji: '⏳',
      agent: 'nurture-stale-leads',
      body: 'Nurture SMS sent.',
    })
  })

  it('falls back to a plain body with null emoji/agent for unstructured text', () => {
    expect(parseAgentMessage('just a plain string')).toEqual({
      emoji: null,
      agent: null,
      body: 'just a plain string',
    })
  })

  it('handles an empty body after the colon', () => {
    expect(parseAgentMessage('🚨 *SafetyAgent*:')).toEqual({
      emoji: '🚨',
      agent: 'SafetyAgent',
      body: '',
    })
  })

  it('preserves multi-line body text', () => {
    const result = parseAgentMessage('💰 *finance*: line one\nline two')
    expect(result.body).toBe('line one\nline two')
  })
})
