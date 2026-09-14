-- Automated invoice payment capture via Stripe Payment Intents (added 2026-09-14)
-- Purely additive. Existing behavior (a business marking an invoice paid
-- manually after taking payment on-site — EFTPOS, cash, etc.) is completely
-- unchanged and remains the default; this adds an OPTIONAL "Pay now" link
-- on the client-facing InvoiceView for businesses that want Minerva to
-- collect card payment automatically instead. No bank account numbers or
-- raw card data ever pass through Minerva's own servers or database — the
-- client's card is tokenized directly by Stripe.js in their browser
-- (Stripe Elements), and Minerva only ever holds a PaymentIntent ID, never
-- card details. This is the same trust boundary the existing subscription
-- checkout (create-checkout-session) already relies on, applied to
-- one-off invoice payments instead of recurring subscriptions.

alter table invoices add column if not exists stripe_payment_intent_id text;
-- Set by create-invoice-payment-intent when a client opens the "Pay now"
-- flow. Used by stripe-webhook's new payment_intent.succeeded handler to
-- find and mark the matching invoice paid. Nullable — an invoice a
-- business marks paid manually (the existing, still-default flow) never
-- gets one, and that's fine; the manual "Mark Paid" button in
-- DispatcherView is untouched by any of this.

alter table invoices add column if not exists payment_method text default 'manual';
-- 'manual' | 'stripe_card' — purely informational, lets DispatcherView
-- show how an invoice was actually paid (useful for reconciliation) without
-- changing anything about how paid/unpaid status itself is computed.
