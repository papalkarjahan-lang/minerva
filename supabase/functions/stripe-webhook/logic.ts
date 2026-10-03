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

export interface DisputeLike {
  id?: string | null
  amount?: number | null
  currency?: string | null
  reason?: string | null
  status?: string | null
  payment_intent?: string | null
}

export interface DisputePlan {
  disputeId: string
  amountCents: number
  currency: string
  reason: string
  paymentIntentId: string | null
}

// charge.dispute.created — a client's bank has initiated a chargeback on a
// Stripe-card invoice payment (create-invoice-payment-intent). Added
// 2026-10-03: before this, Minerva had zero visibility into disputes —
// index.ts's default case silently ignores any event type it doesn't
// explicitly handle, same signature as a key never being configured at
// all. Unlike a declined card (invoice.payment_failed, which just retries
// automatically), a dispute has a hard evidence-submission deadline and
// Stripe immediately deducts the amount from the account balance pending
// resolution — losing by default (no response) is the worst outcome, so
// this needs a human's attention, not just a log line.
export function planDisputeCreated(dispute: DisputeLike): DisputePlan | null {
  if (!dispute.id) return null
  return {
    disputeId: dispute.id,
    amountCents: dispute.amount ?? 0,
    currency: (dispute.currency || 'usd').toUpperCase(),
    reason: dispute.reason || 'unknown',
    paymentIntentId: dispute.payment_intent || null,
  }
}

export function buildDisputeMessage(businessName: string | null, amountCents: number, currency: string, reason: string, invoiceId: string | null): string {
  const amount = (amountCents / 100).toFixed(2)
  const who = businessName ? businessName : 'an unidentified business'
  const invoiceNote = invoiceId ? ` (invoice ${invoiceId})` : ' (could not match to a specific invoice — check Stripe directly)'
  return `Payment dispute opened for ${who}${invoiceNote}: $${amount} ${currency}, reason: ${reason}. Stripe has already deducted this amount pending resolution — respond with evidence in the Stripe Dashboard before the deadline or it's lost automatically.`
}

export function buildDisputeFallbackSummary(businessName: string | null, amountCents: number, currency: string, reason: string): string {
  const amount = (amountCents / 100).toFixed(2)
  return `Dispute opened${businessName ? ` for ${businessName}` : ''}: $${amount} ${currency}, reason: ${reason}. Needs a response with evidence in the Stripe Dashboard before the deadline.`
}

export interface DisputeClosedPlan {
  disputeId: string
  status: string
  amountCents: number
  currency: string
}

// charge.dispute.closed — the dispute has been resolved (won, lost, or
// withdrawn by the cardholder's bank). Alert-only, same as created above —
// there's no local dispute record to update since nothing here stores
// dispute state, only forwards the outcome to a human.
export function planDisputeClosed(dispute: DisputeLike): DisputeClosedPlan | null {
  if (!dispute.id || !dispute.status) return null
  return {
    disputeId: dispute.id,
    status: dispute.status,
    amountCents: dispute.amount ?? 0,
    currency: (dispute.currency || 'usd').toUpperCase(),
  }
}

export function buildDisputeClosedMessage(businessName: string | null, status: string, amountCents: number, currency: string): string {
  const amount = (amountCents / 100).toFixed(2)
  const who = businessName ? businessName : 'an unidentified business'
  return `Dispute for ${who} ($${amount} ${currency}) is now resolved: ${status}.`
}

export interface ChargeRefundedLike {
  id?: string | null
  refunded?: boolean | null
  amount_refunded?: number | null
  currency?: string | null
  payment_intent?: string | null
}

export interface RefundPlan {
  chargeId: string
  amountRefundedCents: number
  currency: string
  paymentIntentId: string | null
}

// charge.refunded — fires on both partial and full refunds; this only
// alerts on a FULL refund (refunded === true). A partial refund doesn't
// change whether the invoice should still read as "paid" overall, and
// deciding how invoices.status/the dispatcher UI should represent a
// partial refund is a real design question, not a 2-line fix — out of
// scope here, same reasoning as the full-refund case not auto-updating
// invoices.status either (see buildRefundMessage below).
export function planChargeRefunded(charge: ChargeRefundedLike): RefundPlan | null {
  if (!charge.id || charge.refunded !== true) return null
  return {
    chargeId: charge.id,
    amountRefundedCents: charge.amount_refunded ?? 0,
    currency: (charge.currency || 'usd').toUpperCase(),
    paymentIntentId: charge.payment_intent || null,
  }
}

// Deliberately tells the reader this did NOT touch invoices.status —
// create-invoice-payment-intent/payment_intent.succeeded auto-mark an
// invoice paid, but nothing auto-reverses that on a refund (deciding how
// a refunded invoice should look across DispatcherView/InvoiceView is a
// real UI question, not something to rush through inside an alert-only
// change). Saying so directly in the alert means whoever reads it knows
// exactly what manual step is still needed, rather than assuming Minerva
// already handled it end-to-end.
export function buildRefundMessage(businessName: string | null, amountRefundedCents: number, currency: string, invoiceId: string | null): string {
  const amount = (amountRefundedCents / 100).toFixed(2)
  const who = businessName ? businessName : 'an unidentified business'
  const invoiceNote = invoiceId ? ` (invoice ${invoiceId})` : ' (could not match to a specific invoice — check Stripe directly)'
  return `A payment for ${who}${invoiceNote} was fully refunded: $${amount} ${currency}. Minerva does not automatically update the invoice's paid status for a refund — check and correct it manually if the invoice still shows paid.`
}

export function buildRefundFallbackSummary(businessName: string | null, amountRefundedCents: number, currency: string): string {
  const amount = (amountRefundedCents / 100).toFixed(2)
  return `Payment fully refunded${businessName ? ` for ${businessName}` : ''}: $${amount} ${currency}. The matching invoice's paid status was NOT automatically updated — check manually.`
}
