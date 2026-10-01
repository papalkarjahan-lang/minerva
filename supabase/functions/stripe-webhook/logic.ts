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

// Cross-tenant hijack guard (added 2026-09-27). create-checkout-session
// takes a bare `businessId` in the request body with NO caller-identity
// check — deliberately, since its one real caller (Onboarding.jsx) runs
// pre-auth, right after creating a brand-new business row with no
// Supabase session yet, so there's no ownership to check at that point.
// That businessId flows untouched into the Stripe Checkout Session's own
// metadata, which a REAL, correctly-signed checkout.session.completed
// webhook later hands back here as session.metadata.business_id — Stripe's
// signature verification proves the checkout genuinely happened, but proves
// nothing about which business the *original* businessId legitimately
// belonged to. Business UUIDs are not secret in this codebase (they appear
// in public tracking/invoice/calendar links every business hands to its
// own clients — the established "unguessable ID" trust model is about
// being hard to guess, not about being confidential once known), so an
// attacker who has ever received a link from a victim business could take
// that business's id, call create-checkout-session directly with it plus
// their OWN card/tier/email, complete a real (or $0 trial) checkout, and
// have this exact webhook branch overwrite the VICTIM's
// stripe_customer_id/stripe_sub_id with the ATTACKER's — after which
// cancelling that subscription (customer.subscription.deleted, matched by
// subscriptionId) would flip the victim's business to
// subscription_tier:'cancelled' with no fault or awareness on the victim's
// part. The one legitimate call path only ever targets a just-created
// business with no Stripe link yet, so the fix costs it nothing: only
// apply the update if the business doesn't already have a *different*
// stripe_customer_id on file. A null existing id (real first-time signup)
// or a matching id (an idempotent Stripe webhook retry of the same event)
// both pass; any other existing id is a hijack attempt and is rejected.
export function shouldApplyCheckoutCompletion(
  existingStripeCustomerId: string | null | undefined,
  planStripeCustomerId: string
): boolean {
  return !existingStripeCustomerId || existingStripeCustomerId === planStripeCustomerId
}

export interface SubscriptionLike {
  id?: string | null
}

export interface SubscriptionCancelledPlan {
  subscriptionId: string
  update: { subscription_tier: 'cancelled'; max_addons: Record<string, never>; max_addon_stripe_items: Record<string, never> }
}

// customer.subscription.deleted — marks the matching business cancelled so
// the app can show a "subscription ended" state instead of continuing
// silently.
//
// Also resets max_addons/max_addon_stripe_items to empty (added 2026-10-01,
// same round update-addon-billing shipped): when Stripe deletes a whole
// subscription, every subscription item on it — including each paid
// add-on's item — is deleted too, but nothing previously cleared the
// matching `max_addons` flags on our side. Since isAddonActive()/hasAddon()
// only ever check that jsonb flag, not subscription_tier, a business could
// cancel their base plan and keep every add-on they'd enabled working for
// free, indefinitely. Trial state (max_addon_trials) is deliberately left
// alone — trials are an unbilled preview regardless of subscription state,
// so cancellation shouldn't cut one short either way.
export function planSubscriptionDeleted(subscription: SubscriptionLike): SubscriptionCancelledPlan | null {
  if (!subscription.id) return null
  return { subscriptionId: subscription.id, update: { subscription_tier: 'cancelled', max_addons: {}, max_addon_stripe_items: {} } }
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
