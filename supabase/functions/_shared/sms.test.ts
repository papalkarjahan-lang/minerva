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
  buildJobCancelledMessage,
  buildJobCancelledTechMessage,
  buildJobRescheduledMessage,
  buildJobRescheduledTechMessage,
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

describe('buildJobCancelledMessage', () => {
  it('names the business and invites a rebook', () => {
    const msg = buildJobCancelledMessage({ clientName: 'Jane', businessName: 'Acme Plumbing' })
    expect(msg).toBe("Hi Jane, your job with Acme Plumbing has been cancelled. Get in touch if you'd like to rebook.")
  })

  it('falls back to "there" when clientName is missing', () => {
    const msg = buildJobCancelledMessage({ businessName: 'Acme Plumbing' })
    expect(msg).toContain('Hi there')
  })
})

describe('buildJobCancelledTechMessage', () => {
  it('tells the technician not to go', () => {
    const msg = buildJobCancelledTechMessage({ techName: 'Sam', clientAddress: '1 Main St' })
    expect(msg).toBe("Hi Sam, the job at 1 Main St has been cancelled — no need to go. Contact your dispatcher with any questions.")
  })

  it('falls back to a generic phrase when clientAddress is missing', () => {
    const msg = buildJobCancelledTechMessage({ techName: 'Sam' })
    expect(msg).toContain('the scheduled address')
  })
})

describe('buildJobRescheduledMessage', () => {
  it('includes the business name and new time', () => {
    const msg = buildJobRescheduledMessage({ clientName: 'Jane', businessName: 'Acme Plumbing', when: 'Mon, 10am' })
    expect(msg).toBe("Hi Jane, your appointment with Acme Plumbing has been rescheduled to Mon, 10am. Reply here if that doesn't work for you.")
  })

  it('falls back to "there" when clientName is missing', () => {
    const msg = buildJobRescheduledMessage({ businessName: 'Acme Plumbing', when: 'Mon, 10am' })
    expect(msg).toContain('Hi there')
  })

  it('states the move from the previous time to the new time when previousWhen is provided', () => {
    const msg = buildJobRescheduledMessage({ clientName: 'Jane', businessName: 'Acme Plumbing', when: 'Mon, 10am', previousWhen: 'Fri, 2pm' })
    expect(msg).toBe("Hi Jane, your appointment with Acme Plumbing has been moved from Fri, 2pm to Mon, 10am. Reply here if that doesn't work for you.")
  })
})

describe('buildJobRescheduledTechMessage', () => {
  it('includes the client address and new time', () => {
    const msg = buildJobRescheduledTechMessage({ techName: 'Sam', clientAddress: '1 Main St', when: 'Mon, 10am' })
    expect(msg).toBe('Hi Sam, the job at 1 Main St has been rescheduled to Mon, 10am.')
  })

  it('falls back to a generic phrase when clientAddress is missing', () => {
    const msg = buildJobRescheduledTechMessage({ techName: 'Sam', when: 'Mon, 10am' })
    expect(msg).toContain('the scheduled address')
  })

  it('states the move from the previous time to the new time when previousWhen is provided', () => {
    const msg = buildJobRescheduledTechMessage({ techName: 'Sam', clientAddress: '1 Main St', when: 'Mon, 10am', previousWhen: 'Fri, 2pm' })
    expect(msg).toBe('Hi Sam, the job at 1 Main St has been moved from Fri, 2pm to Mon, 10am.')
  })
})
