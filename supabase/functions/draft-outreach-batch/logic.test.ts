import { describe, it, expect } from 'vitest'
import { fallbackTemplate, appendUnsubscribeIfMissing } from './logic'

describe('fallbackTemplate', () => {
  it('fills in the real prospect details when all fields are known', () => {
    const { subject, body } = fallbackTemplate({ contact_name: 'Jane', trade_type: 'plumbing', company_name: 'Acme Plumbing' })
    expect(subject).toBe('Quick question for Acme Plumbing')
    expect(body).toContain('Hi Jane,')
    expect(body).toContain('plumbing businesses')
    expect(body).toContain('for Acme Plumbing?')
  })

  it('defaults every field when the prospect row has none of them', () => {
    const { subject, body } = fallbackTemplate({ contact_name: null, trade_type: null, company_name: null })
    expect(subject).toBe('Quick question for your business')
    expect(body).toContain('Hi there,')
    expect(body).toContain('trade businesses')
    expect(body).toContain('for your business?')
  })

  it('always flags itself as the unreviewed fallback, never silently indistinguishable from an AI draft', () => {
    const { body } = fallbackTemplate({ contact_name: 'Jane', trade_type: 'plumbing', company_name: 'Acme' })
    expect(body).toContain('this is the plain-template fallback')
  })

  it('never mentions Xero sync or Pro-tier pricing to an industrial prospect — both are trade-only', () => {
    const { body } = fallbackTemplate({ contact_name: 'Sam', trade_type: 'industrial', company_name: 'BigSite Co' })
    expect(body).not.toContain('Xero')
    expect(body).not.toContain('$119')
    expect(body).toContain('$49-$79/tech/month')
  })

  it('pitches industrial-real capabilities (sites, safety, assets) instead of trade-only ones', () => {
    const { body } = fallbackTemplate({ contact_name: 'Sam', trade_type: 'industrial', company_name: 'BigSite Co' })
    expect(body).toContain('across sites')
    expect(body).toContain('safety incidents')
    expect(body).toContain('asset register')
  })

  it('still pitches the full $49-$119 range and Xero sync for a non-industrial trade prospect', () => {
    const { body } = fallbackTemplate({ contact_name: 'Jane', trade_type: 'plumbing', company_name: 'Acme' })
    expect(body).toContain('Xero')
    expect(body).toContain('$49-$119/tech/month')
  })
})

describe('appendUnsubscribeIfMissing', () => {
  const LINE = '\n\nreply "unsubscribe" to stop hearing from us'

  it('appends the line when the body has no mention of unsubscribing', () => {
    const result = appendUnsubscribeIfMissing('Hi there, want a demo?', LINE)
    expect(result).toBe('Hi there, want a demo?' + LINE)
  })

  it('does not duplicate the line when the body already mentions unsubscribe', () => {
    const body = 'Hi there. Reply "unsubscribe" to opt out.'
    expect(appendUnsubscribeIfMissing(body, LINE)).toBe(body)
  })
})
