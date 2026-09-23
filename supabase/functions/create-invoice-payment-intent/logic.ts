// Pure decision logic for create-invoice-payment-intent, extracted so the
// money-math (dollars→cents) and the "reuse existing PaymentIntent or mint a
// new one" branch can be unit tested with Vitest without a live Stripe/
// Supabase connection or the Deno runtime. index.ts imports these same
// functions and only adds the actual I/O (Supabase read/update, the Stripe
// API calls) around them — this file IS the production decision logic, not
// a reimplementation of it.

export interface InvoiceForPayment {
  status: string | null
  total: number | null
}

export type InvoiceValidation = { ok: true } | { ok: false; error: string }

// Guards against paying an already-paid invoice or one with no payable
// amount — checked before ever calling Stripe.
export function validateInvoiceForPayment(invoice: InvoiceForPayment): InvoiceValidation {
  if (invoice.status === 'paid') return { ok: false, error: 'Invoice is already paid' }
  if (!invoice.total || invoice.total <= 0) return { ok: false, error: 'Invoice has no payable amount' }
  return { ok: true }
}

// Stripe amounts are integer cents. Math.round (not truncation) so a value
// like $110.005 rounds to the nearest cent rather than silently losing it —
// matches how the real production code has always computed this.
export function centsFromDollars(total: number): number {
  return Math.round(Number(total) * 100)
}

export interface ExistingPaymentIntentLike {
  error?: unknown
  status?: string | null
  client_secret?: string | null
}

// Whether a previously-created PaymentIntent for this invoice is still
// usable (client re-opened the pay page) rather than needing a fresh one.
// A PI that's already succeeded or was canceled must never be reused.
export function shouldReuseExistingPaymentIntent(existingPi: ExistingPaymentIntentLike | null | undefined): boolean {
  if (!existingPi || existingPi.error) return false
  return existingPi.status !== 'succeeded' && existingPi.status !== 'canceled'
}

// Human-readable Stripe description shown in the Stripe dashboard.
export function buildPaymentIntentDescription(clientName: string | null | undefined): string {
  return `Minerva invoice${clientName ? ' — ' + clientName : ''}`
}
