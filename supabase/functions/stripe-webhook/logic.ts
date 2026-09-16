// Pure decision logic for stripe-webhook, extracted out of index.ts so the
// "what should we write to the database for this event" branch can be unit
// tested with Vitest without a live Stripe/Supabase connection or the Deno
// runtime. index.ts imports these same functions and only adds the actual
// I/O (Supabase reads/writes, the Stripe API call for subscription item id,
// the best-effort email sends) around them — this file IS the production
// decision logic, not a reimplementation of it.
//
// Every function here takes plain data (already-parsed Stripe event
// payloads) and returns either null (nothing to do) or a plain plan object
// describing the single database write that should happen. No function
// here talks to Stripe, Supabase, or Deno.env.

export interface CheckoutSessionLike {
  metadata?: { business_id?: string | null } | null
  customer?: string | null
  subscription?: string | null
  customer_details?: { email?: string | null } | null
}

export interface CheckoutSessionPlan {
  businessId: string
  update: { stripe_customer_id: string; stripe_sub_id: string; stripe_sub_item_id: string | null }
  welcomeEmailTo: string | null
}

// checkout.session.completed — only proceeds if all three of business_id
// (our own metadata), customer, and subscription are present. subItemId is
// passed in already-resolved (it requires its own Stripe API call in
// index.ts) rather than fetched here, since this function must stay
// synchronous and I/O-free.
export function planCheckoutSessionCompleted(session: CheckoutSessionLike, subItemId: string | null): CheckoutSessionPlan | null {
  const businessId = session.metadata?.business_id
  if (!businessId || !session.customer || !session.subscription) return null
  return {
    businessId,
    update: {
      stripe_customer_id: session.customer,
      stripe_sub_id: session.subscription,
      stripe_sub_item_id: subItemId,
    },
    welcomeEmailTo: session.customer_details?.email || null,
  }
}

export interface SubscriptionLike {
  id?: string | null
}

export interface SubscriptionCancelledPlan {
  subscriptionId: string
  update: { subscription_tier: 'cancelled' }
}

// customer.subscription.deleted — marks the matching business cancelled so
// the app can show a "subscription ended" state instead of continuing
// silently.
export function planSubscriptionDeleted(subscription: SubscriptionLike): SubscriptionCancelledPlan | null {
  if (!subscription.id) return null
  return { subscriptionId: subscription.id, update: { subscription_tier: 'cancelled' } }
}

export interface InvoiceLike {
  subscription?: string | null
}

export interface PaymentFailedPlan {
  subscriptionId: string
  update: { payment_failed_at: string }
}

// invoice.payment_failed — records the failure time so the dispatcher app
// can warn the owner immediately, independent of whether an operator email
// is configured.
export function planInvoicePaymentFailed(invoice: InvoiceLike, nowIso: string): PaymentFailedPlan | null {
  if (!invoice.subscription) return null
  return { subscriptionId: invoice.subscription, update: { payment_failed_at: nowIso } }
}

// Whether the best-effort operator alert email should be attempted for a
// payment_failed event — a pure decision (operatorEmail configured or not)
// kept separate from actually sending it.
export function shouldAlertOperator(operatorEmail: string | null | undefined): boolean {
  return Boolean(operatorEmail)
}

export interface PaymentSucceededPlan {
  subscriptionId: string
  update: { payment_failed_at: null }
}

// invoice.payment_succeeded — clears any previously-recorded failure. Also
// correct (a harmless no-op) for a subscription's very first invoice, where
// payment_failed_at is already null.
export function planInvoicePaymentSucceeded(invoice: InvoiceLike): PaymentSucceededPlan | null {
  if (!invoice.subscription) return null
  return { subscriptionId: invoice.subscription, update: { payment_failed_at: null } }
}

export interface PaymentIntentLike {
  id?: string | null
  metadata?: { invoice_id?: string | null } | null
}

export interface InvoicePaidPlan {
  invoiceId: string
  paymentIntentId: string
  update: { status: 'paid'; paid_at: string; payment_method: 'stripe_card' }
}

// payment_intent.succeeded — the automated counterpart to the dispatcher's
// manual "Mark Paid" button, for the optional "Pay now" one-off invoice
// flow. Matches on both invoice id AND the specific payment intent id (see
// index.ts's .eq('stripe_payment_intent_id', ...)) so a stale/reused
// invoice_id in metadata can't mark the wrong payment intent's invoice paid.
export function planPaymentIntentSucceeded(pi: PaymentIntentLike, nowIso: string): InvoicePaidPlan | null {
  const invoiceId = pi.metadata?.invoice_id
  if (!invoiceId || !pi.id) return null
  return {
    invoiceId,
    paymentIntentId: pi.id,
    update: { status: 'paid', paid_at: nowIso, payment_method: 'stripe_card' },
  }
}
