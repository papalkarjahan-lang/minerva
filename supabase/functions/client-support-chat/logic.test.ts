import { describe, it, expect } from 'vitest'
import { isChatRequestTooLarge, trimToFirstUserMessage, buildFallbackReply } from './logic'

describe('isChatRequestTooLarge', () => {
  it('is false for a short, normal conversation', () => {
    expect(isChatRequestTooLarge([{ role: 'user', content: 'When will the tech arrive?' }])).toBe(false)
  })

  it('is true when there are more than 40 messages', () => {
    const messages = Array.from({ length: 41 }, () => ({ role: 'user' as const, content: 'hi' }))
    expect(isChatRequestTooLarge(messages)).toBe(true)
  })

  it('is true when any message content exceeds 2000 characters', () => {
    expect(isChatRequestTooLarge([{ role: 'user', content: 'x'.repeat(2001) }])).toBe(true)
  })

  it('is true when a message content is not a string', () => {
    expect(isChatRequestTooLarge([{ role: 'user', content: 123 as unknown as string }])).toBe(true)
  })
})

describe('trimToFirstUserMessage', () => {
  it('strips a leading assistant message', () => {
    const messages = [
      { role: 'assistant' as const, content: 'Hi, how can I help?' },
      { role: 'user' as const, content: 'When will the tech arrive?' },
    ]
    expect(trimToFirstUserMessage(messages)).toEqual([{ role: 'user', content: 'When will the tech arrive?' }])
  })

  it('strips multiple leading assistant messages', () => {
    const messages = [
      { role: 'assistant' as const, content: 'a' },
      { role: 'assistant' as const, content: 'b' },
      { role: 'user' as const, content: 'c' },
    ]
    expect(trimToFirstUserMessage(messages)).toEqual([{ role: 'user', content: 'c' }])
  })

  it('leaves a conversation starting with a user message untouched', () => {
    const messages = [{ role: 'user' as const, content: 'hi' }, { role: 'assistant' as const, content: 'hello' }]
    expect(trimToFirstUserMessage(messages)).toEqual(messages)
  })

  it('returns an empty array when every message is from the assistant', () => {
    const messages = [{ role: 'assistant' as const, content: 'a' }]
    expect(trimToFirstUserMessage(messages)).toEqual([])
  })
})

describe('buildFallbackReply', () => {
  const business = { name: 'Acme Plumbing', contactPhone: '0400 000 000' }

  it('includes job status and estimated arrival when present', () => {
    const job = { status: 'in_progress', technicianName: 'Sam', estimatedArrivalAt: '2026-01-01T10:00:00Z', scheduledTime: null }
    const reply = buildFallbackReply(business, job, null)
    expect(reply).toContain('Job status: in_progress.')
    expect(reply).toContain('Technician: Sam.')
    expect(reply).toContain('Estimated arrival:')
    expect(reply).not.toContain('Scheduled:')
  })

  it('falls back to scheduled_time when there is no estimated arrival', () => {
    const job = { status: 'scheduled', technicianName: null, estimatedArrivalAt: null, scheduledTime: '2026-01-02T09:00:00Z' }
    const reply = buildFallbackReply(business, job, null)
    expect(reply).toContain('Scheduled:')
    expect(reply).not.toContain('Estimated arrival:')
  })

  it('includes invoice total and status when present', () => {
    const invoice = { total: 150.5, status: 'unpaid' }
    const reply = buildFallbackReply(business, null, invoice)
    expect(reply).toContain('Invoice total: $150.50, status: unpaid.')
  })

  it('always includes a contact line with the business name and phone', () => {
    const reply = buildFallbackReply(business, null, null)
    expect(reply).toContain('please contact Acme Plumbing on 0400 000 000 directly.')
  })

  it('omits the phone number when contactPhone is not set', () => {
    const reply = buildFallbackReply({ name: 'Acme Plumbing', contactPhone: null }, null, null)
    expect(reply).toContain('please contact Acme Plumbing directly.')
  })
})
