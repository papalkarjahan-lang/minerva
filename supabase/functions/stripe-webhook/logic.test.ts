import { describe, it, expect } from 'vitest'
import {
  planCheckoutSessionCompleted,
  planSubscriptionDeleted,
  planSubscriptionUpdated,
  planInvoicePaymentFailed,
  planInvoicePaymentSucceeded,
  planPaymentIntentSucceeded,
  planDisputeCreated,
  planDisputeClosed,
  buildDisputeMessage,
  buildDisputeFallbackSummary,
  buildDisputeClosedMessage,
  planChargeRefunded,
  planInvoiceRefunded,
  buildRefundMessage,
  buildRefundFallbackSummary,
  shouldAlertOperator,
  shouldApplyCheckoutCompletion,
  stripeEventCreatedToIso,
  buildProIndustrialMismatchMessage,
  buildProIndustrialMismatchFallbackSummary,
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

describe('planSubscriptionUpdated', () => {
  const PRICE_MAP = { price_starter: 'starter', price_std: 'standard', price_pro: 'pro' } as const

  it('returns null when the subscription has no id', () => {
    expect(planSubscriptionUpdated({ status: 'active', items: { data: [{ price: { id: 'price_pro' } }] } }, PRICE_MAP)).toBeNull()
  })

  it('syncs subscription_tier to the plan matching the subscription current price', () => {
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'active', items: { data: [{ price: { id: 'price_pro' } }] } }, PRICE_MAP))
      .toEqual({ subscriptionId: 'sub_1', update: { subscription_tier: 'pro' } })
  })

  it('maps a downgrade to Starter correctly, not just upgrades', () => {
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'active', items: { data: [{ price: { id: 'price_starter' } }] } }, PRICE_MAP))
      .toEqual({ subscriptionId: 'sub_1', update: { subscription_tier: 'starter' } })
  })

  it('returns null for a status that is not active/trialing (never races a concurrent cancellation)', () => {
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'canceled', items: { data: [{ price: { id: 'price_pro' } }] } }, PRICE_MAP)).toBeNull()
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'past_due', items: { data: [{ price: { id: 'price_pro' } }] } }, PRICE_MAP)).toBeNull()
  })

  it('allows a trialing subscription (a brand-new Stripe-native trial, not yet active)', () => {
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'trialing', items: { data: [{ price: { id: 'price_std' } }] } }, PRICE_MAP))
      .toEqual({ subscriptionId: 'sub_1', update: { subscription_tier: 'standard' } })
  })

  it('returns null for an unrecognized price id rather than guessing', () => {
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'active', items: { data: [{ price: { id: 'price_unknown_product' } }] } }, PRICE_MAP)).toBeNull()
  })

  it('returns null when no price id is present at all', () => {
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'active', items: { data: [] } }, PRICE_MAP)).toBeNull()
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'active' }, PRICE_MAP)).toBeNull()
  })

  it('also accepts price as a bare string id, not just an expanded object', () => {
    expect(planSubscriptionUpdated({ id: 'sub_1', status: 'active', items: { data: [{ price: 'price_pro' }] } }, PRICE_MAP))
      .toEqual({ subscriptionId: 'sub_1', update: { subscription_tier: 'pro' } })
  })

  it('finds the base-plan item even when an add-on item is at index 0 (update-addon-billing adds items after the base plan, same subscription)', () => {
    expect(planSubscriptionUpdated({
      id: 'sub_1',
      status: 'active',
      items: { data: [{ price: { id: 'price_addon_ai_quotes' } }, { price: { id: 'price_std' } }] },
    }, PRICE_MAP)).toEqual({ subscriptionId: 'sub_1', update: { subscription_tier: 'standard' } })
  })

  it('returns null when every item is an add-on with no base-plan item present at all', () => {
    expect(planSubscriptionUpdated({
      id: 'sub_1',
      status: 'active',
      items: { data: [{ price: { id: 'price_addon_ai_quotes' } }, { price: { id: 'price_addon_xero_sync' } }] },
    }, PRICE_MAP)).toBeNull()
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

describe('planInvoiceRefunded', () => {
  it('builds the refunded status + timestamp update', () => {
    expect(planInvoiceRefunded(NOW)).toEqual({
      update: { status: 'refunded', refunded_at: NOW },
    })
  })
})

describe('buildRefundMessage', () => {
  it('names the business and invoice when both are known, and confirms the automatic status update', () => {
    const msg = buildRefundMessage('Acme Plumbing', 4999, 'AUD', 'inv_1')
    expect(msg).toContain('Acme Plumbing')
    expect(msg).toContain('$49.99 AUD')
    expect(msg).toContain('inv_1')
    expect(msg).toContain('marked refunded automatically')
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

describe('stripeEventCreatedToIso', () => {
  it('converts Unix seconds to an ISO timestamp, not Unix milliseconds', () => {
    // 1759900800 = 2025-10-08T05:20:00.000Z (verified with
    // `new Date(1759900800 * 1000).toISOString()`, not hand-computed —
    // this exact kind of date arithmetic is easy to get wrong by eye).
    // The footgun this helper exists to prevent: new Date(1759900800) with
    // no * 1000 lands in January 1970, not 2025 — a wrong-by-1000x bug
    // that would make the ordering guard in index.ts compare against a
    // garbage timestamp.
    expect(stripeEventCreatedToIso(1759900800)).toBe('2025-10-08T05:20:00.000Z')
  })

  it('round-trips Date.now()-derived seconds back to the same second', () => {
    const nowMs = Date.UTC(2026, 0, 15, 10, 30, 45)
    const unixSeconds = nowMs / 1000
    expect(stripeEventCreatedToIso(unixSeconds)).toBe(new Date(nowMs).toISOString())
  })

  it('preserves chronological ordering under string comparison (what the DB guard relies on)', () => {
    const earlier = stripeEventCreatedToIso(1759900800)
    const later = stripeEventCreatedToIso(1759900860) // 60s later
    expect(earlier < later).toBe(true)
  })
})

describe('buildProIndustrialMismatchMessage', () => {
  it('names the business and explains the overcharge when the business is known', () => {
    const msg = buildProIndustrialMismatchMessage('Acme Civil', 'sub_123')
    expect(msg).toContain('Acme Civil')
    expect(msg).toContain('Industrial')
    expect(msg).toContain('$119')
    expect(msg).toContain('$79')
    expect(msg).toContain('sub_123')
  })

  it('falls back to generic wording when the business could not be resolved', () => {
    const msg = buildProIndustrialMismatchMessage(null, 'sub_456')
    expect(msg).toContain('A business')
    expect(msg).not.toContain('null')
  })
})

describe('buildProIndustrialMismatchFallbackSummary', () => {
  it('includes the business name when known', () => {
    expect(buildProIndustrialMismatchFallbackSummary('Acme Civil', 'sub_123')).toContain('Acme Civil')
  })

  it('falls back to generic wording when unknown rather than naming it falsely', () => {
    const summary = buildProIndustrialMismatchFallbackSummary(null, 'sub_456')
    expect(summary).toContain('A business')
    expect(summary).not.toContain('null')
  })
})
