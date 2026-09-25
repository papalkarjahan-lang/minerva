import { describe, it, expect } from 'vitest'
import { escapeHtml } from './html'

describe('escapeHtml', () => {
  it('escapes the 5 HTML-significant characters', () => {
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;')
  })

  it('neutralises an injected tag', () => {
    expect(escapeHtml('<a href="evil">click</a>')).toBe('&lt;a href=&quot;evil&quot;&gt;click&lt;/a&gt;')
  })

  it('leaves plain text with an ampersand readable once escaped', () => {
    expect(escapeHtml('Smith & Sons Plumbing')).toBe('Smith &amp; Sons Plumbing')
  })

  it('returns an empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })

  it('leaves ordinary text untouched', () => {
    expect(escapeHtml('Acme Plumbing 123')).toBe('Acme Plumbing 123')
  })
})
