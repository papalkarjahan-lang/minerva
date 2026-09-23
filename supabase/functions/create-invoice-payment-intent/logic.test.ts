import { describe, it, expect } from 'vitest'
import {
  validateInvoiceForPayment,
  centsFromDollars,
  shouldReuseExistingPaymentIntent,
  buildPaymentIntentDescription,
} from './logic'

describe('validateInvoiceForPayment', () => {
  it('rejects an already-paid invoice', () => {
    expect(validateInvoiceForPayment({ status: 'paid', total: 100 })).toEqual({ ok: false, error: 'Invoice is already paid' })
  })

  it('rejects a zero-total invoice', () => {
    expect(validateInvoiceForPayment({ status: 'sent', total: 0 })).toEqual({ ok: false, error: 'Invoice has no payable amount' })
  })

  it('rejects a negative-total invoice', () => {
    expect(validateInvoiceForPayment({ status: 'sent', total: -50 })).toEqual({ ok: false, error: 'Invoice has no payable amount' })
  })

  it('rejects a null total', () => {
    expect(validateInvoiceForPayment({ status: 'sent', total: null })).toEqual({ ok: false, error: 'Invoice has no payable amount' })
  })

  it('accepts a valid unpaid invoice with a positive total', () => {
    expect(validateInvoiceForPayment({ status: 'sent', total: 110.5 })).toEqual({ ok: true })
  })
})

describe('centsFromDollars', () => {
  it('converts whole dollars to cents', () => {
    expect(centsFromDollars(110)).toBe(11000)
  })

  it('converts cents-precision amounts exactly', () => {
    expect(centsFromDollars(110.5)).toBe(11050)
    expect(centsFromDollars(19.99)).toBe(1999)
  })

  it('rounds sub-cent floating point noise to the nearest cent', () => {
    // 0.1 + 0.2 style float imprecision must not leak into a Stripe amount.
    expect(centsFromDollars(19.995)).toBe(2000)
    expect(centsFromDollars(0.1 + 0.2)).toBe(30)
  })

  it('handles a string-typed numeric value the same as a number', () => {
    expect(centsFromDollars('45.5' as unknown as number)).toBe(4550)
  })
})

describe('shouldReuseExistingPaymentIntent', () => {
  it('returns false when there is no existing PaymentIntent', () => {
    expect(shouldReuseExistingPaymentIntent(null)).toBe(false)
    expect(shouldReuseExistingPaymentIntent(undefined)).toBe(false)
  })

  it('returns false when Stripe returned an error looking it up', () => {
    expect(shouldReuseExistingPaymentIntent({ error: { message: 'No such payment_intent' } })).toBe(false)
  })

  it('returns false for an already-succeeded PaymentIntent (must not double-charge)', () => {
    expect(shouldReuseExistingPaymentIntent({ status: 'succeeded' })).toBe(false)
  })

  it('returns false for a canceled PaymentIntent', () => {
    expect(shouldReuseExistingPaymentIntent({ status: 'canceled' })).toBe(false)
  })

  it('returns true for a still-open PaymentIntent (e.g. requires_payment_method)', () => {
    expect(shouldReuseExistingPaymentIntent({ status: 'requires_payment_method' })).toBe(true)
    expect(shouldReuseExistingPaymentIntent({ status: 'requires_action' })).toBe(true)
  })
})

describe('buildPaymentIntentDescription', () => {
  it('includes the client name when present', () => {
    expect(buildPaymentIntentDescription('Jane Smith')).toBe('Minerva invoice — Jane Smith')
  })

  it('omits the dash entirely when no client name is set', () => {
    expect(buildPaymentIntentDescription(null)).toBe('Minerva invoice')
    expect(buildPaymentIntentDescription(undefined)).toBe('Minerva invoice')
    expect(buildPaymentIntentDescription('')).toBe('Minerva invoice')
  })
})
