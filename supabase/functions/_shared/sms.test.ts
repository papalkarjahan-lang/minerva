import { describe, it, expect } from 'vitest'
import {
  formatAuPhone,
  buildJobAssignmentMessage,
  buildJobReassignmentMessage,
  buildEtaMessage,
  etaPhraseFromDistance,
  buildCompletionMessage,
  buildInvoiceMessage,
  buildReviewRequestMessage,
  buildMissedCallSmsMessage,
  buildJobCancelledMessage,
  buildJobCancelledTechMessage,
  buildJobRescheduledMessage,
  buildJobRescheduledTechMessage,
  buildAppointmentReminderMessage,
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

  it('adds the missing + for a bare country code with no plus', () => {
    expect(formatAuPhone('61412345678')).toBe('+61412345678')
  })

  it('strips a redundant leading 0 after +61 (common "just stick +61 on my number" mistake)', () => {
    expect(formatAuPhone('+610412345678')).toBe('+61412345678')
  })

  it('strips dashes and parentheses, not just whitespace', () => {
    expect(formatAuPhone('0412-345-678')).toBe('+61412345678')
    expect(formatAuPhone('(04) 1234 5678')).toBe('+61412345678')
  })

  it('leaves a different country\'s E.164 number untouched', () => {
    expect(formatAuPhone('+14155552671')).toBe('+14155552671')
  })

  it('correctly formats a landline (non-mobile area code)', () => {
    expect(formatAuPhone('03 9876 5432')).toBe('+61398765432')
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
      distanceKm: 1.5,
    })
    expect(msg).toContain('Jane')
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('Sam')
    expect(msg).toContain('https://example.com/track/123')
  })

  it('bases the ETA phrase on the real distance, not a fixed number', () => {
    const near = buildEtaMessage({ clientName: 'Jane', businessName: 'Acme', techName: 'Sam', trackingUrl: 'x', distanceKm: 0.2 })
    const far = buildEtaMessage({ clientName: 'Jane', businessName: 'Acme', techName: 'Sam', trackingUrl: 'x', distanceKm: 2 })
    expect(near).not.toBe(far)
  })
})

describe('etaPhraseFromDistance', () => {
  it('converts distance to a proportional minutes estimate', () => {
    // 2km at the 25km/h local-street assumption = 4.8min, rounds to 5.
    expect(etaPhraseFromDistance(2)).toBe('is approximately 5 minutes away')
    // 0.5km = 1.2min, rounds to 1 — exercises the singular "minute" branch.
    expect(etaPhraseFromDistance(0.5)).toBe('is approximately 1 minute away')
  })

  it('floors at 1 minute rather than ever showing 0 or a negative number', () => {
    expect(etaPhraseFromDistance(0)).toBe('is approximately 1 minute away')
  })

  it('does not claim a specific number when distance is unavailable', () => {
    expect(etaPhraseFromDistance(null)).toBe('is on the way')
    expect(etaPhraseFromDistance(undefined)).toBe('is on the way')
    expect(etaPhraseFromDistance(-1)).toBe('is on the way')
    expect(etaPhraseFromDistance(NaN)).toBe('is on the way')
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

describe('buildAppointmentReminderMessage', () => {
  it('includes the client address and the scheduled time', () => {
    const msg = buildAppointmentReminderMessage({ clientName: 'Jane', businessName: 'Acme Plumbing', clientAddress: '1 Main St', when: 'tomorrow, 10am' })
    expect(msg).toBe('Hi Jane, just a reminder — Acme Plumbing has you scheduled for tomorrow, 10am at 1 Main St. Reply here if you need to reschedule.')
  })

  it('omits the address clause when clientAddress is missing', () => {
    const msg = buildAppointmentReminderMessage({ clientName: 'Jane', businessName: 'Acme Plumbing', when: 'tomorrow, 10am' })
    expect(msg).toBe('Hi Jane, just a reminder — Acme Plumbing has you scheduled for tomorrow, 10am. Reply here if you need to reschedule.')
  })

  it('falls back to a generic greeting when clientName is missing', () => {
    const msg = buildAppointmentReminderMessage({ businessName: 'Acme Plumbing', when: 'tomorrow, 10am' })
    expect(msg).toContain('Hi there, just a reminder')
  })
})
