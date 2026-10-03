import { describe, it, expect } from 'vitest'
import {
  planCheckoutSessionCompleted,
  planSubscriptionDeleted,
  planInvoicePaymentFailed,
  planInvoicePaymentSucceeded,
  planPaymentIntentSucceeded,
  planDisputeCreated,
  planDisputeClosed,
  buildDisputeMessage,
  buildDisputeFallbackSummary,
  buildDisputeClosedMessage,
  planChargeRefunded,
  buildRefundMessage,
  buildRefundFallbackSummary,
  shouldAlertOperator,
  shouldApplyCheckoutCompletion,
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

describe('shouldApplyCheckoutCompletion', () => {
  it('allows a real first-time signup (no existing stripe_customer_id)', () => {
    expect(shouldApplyCheckoutCompletion(null, 'cus_1')).toBe(true)
    expect(shouldApplyCheckoutCompletion(undefined, 'cus_1')).toBe(true)
  })

  it('allows an idempotent retry of the same event (existing id matches)', () => {
    expect(shouldApplyCheckoutCompletion('cus_1', 'cus_1')).toBe(true)
  })

  it('rejects a checkout for a different Stripe customer than the one already on file (hijack attempt)', () => {
    expect(shouldApplyCheckoutCompletion('cus_victim', 'cus_attacker')).toBe(false)
  })
})

describe('planSubscriptionDeleted', () => {
  it('returns null when the subscription has no id', () => {
    expect(planSubscriptionDeleted({})).toBeNull()
  })

  it('marks the matching subscription cancelled and clears paid add-on state', () => {
    expect(planSubscriptionDeleted({ id: 'sub_1' })).toEqual({
      subscriptionId: 'sub_1',
      update: { subscription_tier: 'cancelled', max_addons: {}, max_addon_stripe_items: {} },
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

describe('planDisputeCreated', () => {
  it('returns null when the dispute has no id', () => {
    expect(planDisputeCreated({})).toBeNull()
  })

  it('builds the plan with sensible defaults for missing fields', () => {
    expect(planDisputeCreated({ id: 'dp_1' })).toEqual({
      disputeId: 'dp_1',
      amountCents: 0,
      currency: 'USD',
      reason: 'unknown',
      paymentIntentId: null,
    })
  })

  it('carries through amount/currency/reason/payment_intent when present', () => {
    expect(planDisputeCreated({ id: 'dp_1', amount: 4999, currency: 'aud', reason: 'fraudulent', payment_intent: 'pi_1' })).toEqual({
      disputeId: 'dp_1',
      amountCents: 4999,
      currency: 'AUD',
      reason: 'fraudulent',
      paymentIntentId: 'pi_1',
    })
  })
})

describe('buildDisputeMessage', () => {
  it('names the business and invoice when both are known', () => {
    const msg = buildDisputeMessage('Acme Plumbing', 4999, 'AUD', 'fraudulent', 'inv_1')
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('$49.99 AUD')
    expect(msg).toContain('fraudulent')
    expect(msg).toContain('inv_1')
  })

  it('falls back to generic wording when business/invoice could not be resolved', () => {
    const msg = buildDisputeMessage(null, 4999, 'AUD', 'fraudulent', null)
    expect(msg).toContain('an unidentified business')
    expect(msg).toContain('could not match to a specific invoice')
  })
})

describe('buildDisputeFallbackSummary', () => {
  it('includes the business name when known', () => {
    expect(buildDisputeFallbackSummary('Acme Plumbing', 4999, 'AUD', 'fraudulent')).toContain('for Acme Plumbing')
  })

  it('omits the business clause when unknown rather than naming it falsely', () => {
    const summary = buildDisputeFallbackSummary(null, 4999, 'AUD', 'fraudulent')
    expect(summary).not.toContain('for null')
    expect(summary).toContain('Dispute opened:')
  })
})

describe('planDisputeClosed', () => {
  it('returns null when the dispute has no id or no status', () => {
    expect(planDisputeClosed({})).toBeNull()
    expect(planDisputeClosed({ id: 'dp_1' })).toBeNull()
  })

  it('builds the plan when id and status are both present', () => {
    expect(planDisputeClosed({ id: 'dp_1', status: 'won', amount: 4999, currency: 'aud' })).toEqual({
      disputeId: 'dp_1',
      status: 'won',
      amountCents: 4999,
      currency: 'AUD',
    })
  })
})

describe('buildDisputeClosedMessage', () => {
  it('reports the business name and outcome', () => {
    const msg = buildDisputeClosedMessage('Acme Plumbing', 'won', 4999, 'AUD')
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('$49.99 AUD')
    expect(msg).toContain('won')
  })

  it('falls back to generic wording when the business could not be resolved', () => {
    expect(buildDisputeClosedMessage(null, 'lost', 4999, 'AUD')).toContain('an unidentified business')
  })
})

describe('planChargeRefunded', () => {
  it('returns null when the charge has no id', () => {
    expect(planChargeRefunded({ refunded: true })).toBeNull()
  })

  it('returns null for a partial refund (refunded !== true)', () => {
    expect(planChargeRefunded({ id: 'ch_1', refunded: false, amount_refunded: 500 })).toBeNull()
    expect(planChargeRefunded({ id: 'ch_1', amount_refunded: 500 })).toBeNull()
  })

  it('builds the plan for a full refund', () => {
    expect(planChargeRefunded({ id: 'ch_1', refunded: true, amount_refunded: 4999, currency: 'aud', payment_intent: 'pi_1' })).toEqual({
      chargeId: 'ch_1',
      amountRefundedCents: 4999,
      currency: 'AUD',
      paymentIntentId: 'pi_1',
    })
  })

  it('defaults amount to 0 and payment intent to null when missing', () => {
    expect(planChargeRefunded({ id: 'ch_1', refunded: true })).toEqual({
      chargeId: 'ch_1',
      amountRefundedCents: 0,
      currency: 'USD',
      paymentIntentId: null,
    })
  })
})

describe('buildRefundMessage', () => {
  it('names the business and invoice when both are known, and says status was not auto-updated', () => {
    const msg = buildRefundMessage('Acme Plumbing', 4999, 'AUD', 'inv_1')
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('$49.99 AUD')
    expect(msg).toContain('inv_1')
    expect(msg).toContain('does not automatically update')
  })

  it('falls back to generic wording when business/invoice could not be resolved', () => {
    const msg = buildRefundMessage(null, 4999, 'AUD', null)
    expect(msg).toContain('an unidentified business')
    expect(msg).toContain('could not match to a specific invoice')
  })
})

describe('buildRefundFallbackSummary', () => {
  it('includes the business name when known', () => {
    expect(buildRefundFallbackSummary('Acme Plumbing', 4999, 'AUD')).toContain('for Acme Plumbing')
  })

  it('omits the business clause when unknown rather than naming it falsely', () => {
    const summary = buildRefundFallbackSummary(null, 4999, 'AUD')
    expect(summary).not.toContain('for null')
    expect(summary).toContain('Payment fully refunded:')
  })
})
