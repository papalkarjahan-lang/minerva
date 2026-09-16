import { describe, it, expect } from 'vitest'
import {
  planCheckoutSessionCompleted,
  planSubscriptionDeleted,
  planInvoicePaymentFailed,
  planInvoicePaymentSucceeded,
  planPaymentIntentSucceeded,
  shouldAlertOperator,
} from './logic'

const NOW = '2026-09-16T12:00:00.000Z'

describe('planCheckoutSessionCompleted', () => {
  it('returns null when business_id metadata is missing', () => {
    expect(planCheckoutSessionCompleted({ customer: 'cus_1', subscription: 'sub_1' }, null)).toBeNull()
  })

  it('returns null when customer or subscription is missing (partial/test session)', () => {
    expect(planCheckoutSessionCompleted({ metadata: { business_id: 'biz_1' }, subscription: 'sub_1' }, null)).toBeNull()
    expect(planCheckoutSessionCompleted({ metadata: { business_id: 'biz_1' }, customer: 'cus_1' }, null)).toBeNull()
  })

  it('builds the Stripe-ID update and welcome-email plan when everything is present', () => {
    const plan = planCheckoutSessionCompleted({
      metadata: { business_id: 'biz_1' },
      customer: 'cus_1',
      subscription: 'sub_1',
      customer_details: { email: 'owner@example.com' },
    }, 'si_1')
    expect(plan).toEqual({
      businessId: 'biz_1',
      update: { stripe_customer_id: 'cus_1', stripe_sub_id: 'sub_1', stripe_sub_item_id: 'si_1' },
      welcomeEmailTo: 'owner@example.com',
    })
  })

  it('welcomeEmailTo is null when no customer email was collected', () => {
    const plan = planCheckoutSessionCompleted({ metadata: { business_id: 'biz_1' }, customer: 'cus_1', subscription: 'sub_1' }, null)
    expect(plan!.welcomeEmailTo).toBeNull()
  })

  it('carries a null subItemId through untouched if the Stripe lookup failed', () => {
    const plan = planCheckoutSessionCompleted({ metadata: { business_id: 'biz_1' }, customer: 'cus_1', subscription: 'sub_1' }, null)
    expect(plan!.update.stripe_sub_item_id).toBeNull()
  })
})

describe('planSubscriptionDeleted', () => {
  it('returns null when the subscription has no id', () => {
    expect(planSubscriptionDeleted({})).toBeNull()
  })

  it('marks the matching subscription cancelled', () => {
    expect(planSubscriptionDeleted({ id: 'sub_1' })).toEqual({
      subscriptionId: 'sub_1',
      update: { subscription_tier: 'cancelled' },
    })
  })
})

describe('planInvoicePaymentFailed', () => {
  it('returns null for an invoice with no subscription (e.g. a one-off invoice)', () => {
    expect(planInvoicePaymentFailed({}, NOW)).toBeNull()
  })

  it('records the failure timestamp against the subscription', () => {
    expect(planInvoicePaymentFailed({ subscription: 'sub_1' }, NOW)).toEqual({
      subscriptionId: 'sub_1',
      update: { payment_failed_at: NOW },
    })
  })
})

describe('shouldAlertOperator', () => {
  it('is false when OPERATOR_EMAIL is unset or empty', () => {
    expect(shouldAlertOperator(undefined)).toBe(false)
    expect(shouldAlertOperator(null)).toBe(false)
    expect(shouldAlertOperator('')).toBe(false)
  })

  it('is true when an operator email is configured', () => {
    expect(shouldAlertOperator('me@example.com')).toBe(true)
  })
})

describe('planInvoicePaymentSucceeded', () => {
  it('returns null for an invoice with no subscription', () => {
    expect(planInvoicePaymentSucceeded({})).toBeNull()
  })

  it('clears payment_failed_at for the matching subscription', () => {
    expect(planInvoicePaymentSucceeded({ subscription: 'sub_1' })).toEqual({
      subscriptionId: 'sub_1',
      update: { payment_failed_at: null },
    })
  })
})

describe('planPaymentIntentSucceeded', () => {
  it('returns null when there is no invoice_id in metadata', () => {
    expect(planPaymentIntentSucceeded({ id: 'pi_1' }, NOW)).toBeNull()
  })

  it('returns null when the payment intent has no id', () => {
    expect(planPaymentIntentSucceeded({ metadata: { invoice_id: 'inv_1' } }, NOW)).toBeNull()
  })

  it('marks the specific invoice paid, matched by both invoice id and payment intent id', () => {
    expect(planPaymentIntentSucceeded({ id: 'pi_1', metadata: { invoice_id: 'inv_1' } }, NOW)).toEqual({
      invoiceId: 'inv_1',
      paymentIntentId: 'pi_1',
      update: { status: 'paid', paid_at: NOW, payment_method: 'stripe_card' },
    })
  })
})
