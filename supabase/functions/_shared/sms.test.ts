import { describe, it, expect } from 'vitest'
import {
  formatAuPhone,
  buildJobAssignmentMessage,
  buildJobReassignmentMessage,
  buildEtaMessage,
  buildCompletionMessage,
  buildInvoiceMessage,
  buildReviewRequestMessage,
  buildMissedCallSmsMessage,
} from './sms'

describe('formatAuPhone', () => {
  it('converts a national-format 04 mobile number to E.164', () => {
    expect(formatAuPhone('0412 345 678')).toBe('+61412345678')
  })

  it('strips internal whitespace before converting', () => {
    expect(formatAuPhone('04 1234 5678')).toBe('+61412345678')
  })

  it('leaves an already-E.164 number untouched', () => {
    expect(formatAuPhone('+61412345678')).toBe('+61412345678')
  })

  it('assumes AU for a bare national number with no leading 0 or +', () => {
    expect(formatAuPhone('412345678')).toBe('+61412345678')
  })
})

describe('buildJobAssignmentMessage', () => {
  it('builds a standard assignment message with no emergency tag', () => {
    const msg = buildJobAssignmentMessage({
      techName: 'Sam',
      businessName: 'Acme Plumbing',
      clientName: 'Jane Doe',
      clientAddress: '1 Main St',
      when: 'Mon, 10am',
      isEmergency: false,
    })
    expect(msg).toBe('Hi Sam, new job assigned from Acme Plumbing: Jane Doe at 1 Main St, Mon, 10am. Open Minerva to view details.')
  })

  it('adds an [EMERGENCY] tag when isEmergency is true', () => {
    const msg = buildJobAssignmentMessage({
      techName: 'Sam',
      businessName: 'Acme Plumbing',
      clientName: 'Jane Doe',
      clientAddress: '1 Main St',
      when: 'ASAP',
      isEmergency: true,
    })
    expect(msg).toContain('[EMERGENCY]')
  })

  it('falls back to defaults when optional fields are missing', () => {
    const msg = buildJobAssignmentMessage({
      businessName: 'Acme Plumbing',
      when: 'ASAP',
    })
    expect(msg).toContain('Client at address on file')
  })
})

describe('buildJobReassignmentMessage', () => {
  it('builds a reassignment message with the client address', () => {
    const msg = buildJobReassignmentMessage({ techName: 'Sam', clientAddress: '1 Main St' })
    expect(msg).toBe("Hi Sam, your job at 1 Main St has been reassigned to someone else. If you're already on the way, contact your dispatcher.")
  })

  it('falls back to a generic phrase when clientAddress is missing', () => {
    const msg = buildJobReassignmentMessage({ techName: 'Sam' })
    expect(msg).toContain('the scheduled address')
  })
})

describe('buildEtaMessage', () => {
  it('includes the client name, technician, business, and tracking url', () => {
    const msg = buildEtaMessage({
      clientName: 'Jane',
      businessName: 'Acme Plumbing',
      techName: 'Sam',
      trackingUrl: 'https://example.com/track/123',
    })
    expect(msg).toContain('Jane')
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('Sam')
    expect(msg).toContain('https://example.com/track/123')
  })
})

describe('buildCompletionMessage', () => {
  it('thanks the client and names the technician and business', () => {
    const msg = buildCompletionMessage({ clientName: 'Jane', techName: 'Sam', businessName: 'Acme Plumbing' })
    expect(msg).toBe('Hi Jane, Sam from Acme Plumbing has completed your job. Thank you for choosing us!')
  })
})

describe('buildInvoiceMessage', () => {
  it('includes a formatted total when provided', () => {
    const msg = buildInvoiceMessage({ clientName: 'Jane', businessName: 'Acme Plumbing', invoiceUrl: 'https://example.com/inv/1', total: 150 })
    expect(msg).toContain('($150.00)')
    expect(msg).toContain('https://example.com/inv/1')
  })

  it('omits the total parens when total is not a number', () => {
    const msg = buildInvoiceMessage({ clientName: 'Jane', businessName: 'Acme Plumbing', invoiceUrl: 'https://example.com/inv/1' })
    expect(msg).not.toContain('(')
  })

  it('falls back to "there" when clientName is missing', () => {
    const msg = buildInvoiceMessage({ businessName: 'Acme Plumbing', invoiceUrl: 'https://example.com/inv/1' })
    expect(msg).toContain('Hi there')
  })
})

describe('buildReviewRequestMessage', () => {
  it('includes the business name and tracking link', () => {
    const msg = buildReviewRequestMessage({ clientName: 'Jane', businessName: 'Acme Plumbing', trackingLink: 'https://example.com/r/1' })
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('https://example.com/r/1')
  })

  it('still includes the business name and link when clientName is missing', () => {
    const msg = buildReviewRequestMessage({ businessName: 'Acme Plumbing', trackingLink: 'https://example.com/r/1' })
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('https://example.com/r/1')
  })
})

describe('buildMissedCallSmsMessage', () => {
  it('names the business in the auto-reply', () => {
    const msg = buildMissedCallSmsMessage('Acme Plumbing')
    expect(msg).toBe("Thanks for calling Acme Plumbing! We missed you - reply here or call back and we'll help book your job.")
  })
})
