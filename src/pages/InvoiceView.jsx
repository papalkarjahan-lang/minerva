import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js'
import { supabase } from '../supabaseClient'
import ClientSupportChat from '../components/ClientSupportChat'
import LoadingScreen from '../components/LoadingScreen'

// Client-facing, read-only invoice view (Pro tier). Texted to the client
// via send-invoice-sms once a technician builds the invoice on job
// completion. This displays the invoice and its paid/unpaid status. The
// business marking an invoice paid manually after taking payment on-site
// (EFTPOS, cash, etc.) remains the default, unchanged flow — see the "Mark
// Paid" button in DispatcherView, which this doesn't touch. The "Pay now"
// card button below is a purely OPTIONAL addition (2026-09-14): if the
// business has a Stripe publishable key configured, a client can instead
// pay by card right here. Card details are entered directly into Stripe's
// own hosted Payment Element (an iframe) — they never pass through this
// component, Minerva's servers, or Minerva's database. See
// create-invoice-payment-intent and stripe-webhook's payment_intent.succeeded
// handler for the rest of this flow.
const stripePromise = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  ? loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  : null

export default function InvoiceView() {
  const { invoiceId } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [business, setBusiness] = useState(null)
  const [error, setError] = useState(null)
  const [clientSecret, setClientSecret] = useState(null)
  const [payError, setPayError] = useState(null)
  const [payOpen, setPayOpen] = useState(false)

  useEffect(() => { loadInvoice() }, [invoiceId])

  async function loadInvoice() {
    const { data, error: err } = await supabase
      .from('invoices').select('*, businesses(name)').eq('id', invoiceId).single()
    if (err || !data) { setError('This invoice link is invalid or has expired.'); return null }
    setInvoice(data)
    setBusiness(data.businesses)
    return data
  }

  // stripe.confirmPayment resolving successfully only means the card was
  // charged — invoices.status is set to 'paid' separately, by stripe-webhook's
  // payment_intent.succeeded handler, which can land a second or two later.
  // A single immediate re-fetch right after confirmPayment can easily lose
  // that race and briefly (or, on a slow webhook delivery, not-so-briefly)
  // show "UNPAID" right after a client just paid. Poll for a few seconds
  // instead of a single fetch; PayNowForm keeps its "Processing..." state
  // shown for the duration (see its onPaid caller below).
  async function pollUntilPaid() {
    for (let i = 0; i < 5; i++) {
      const data = await loadInvoice()
      if (data?.status === 'paid') return
      if (i < 4) await new Promise(resolve => setTimeout(resolve, 1500))
    }
  }

  async function startPayNow() {
    setPayError(null)
    setPayOpen(true)
    if (clientSecret) return // already fetched
    const { data, error: err } = await supabase.functions.invoke('create-invoice-payment-intent', { body: { invoiceId } })
    if (err || data?.error) { setPayError(data?.error || 'Could not start payment. Please try again.'); return }
    setClientSecret(data.clientSecret)
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!invoice) return <LoadingScreen label="Loading invoice..." />

  const items = Array.isArray(invoice.line_items) ? invoice.line_items : []

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <p style={styles.bizName}>{business?.name}</p>
            <h1 style={styles.title}>Invoice</h1>
          </div>
          <span style={styles.statusBadge(invoice.status)}>{invoice.status === 'paid' ? 'PAID' : 'UNPAID'}</span>
        </div>

        {invoice.ai_verified && (
          <p style={styles.verifiedNote}>✓ AI-verified: completion photos were checked against the job checklist</p>
        )}

        <p style={styles.clientLine}>Billed to: <strong>{invoice.client_name || 'Client'}</strong></p>
        <p style={styles.dateLine}>{new Date(invoice.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>

        <div style={styles.divider} />

        {items.map((item, i) => (
          <div key={i} style={styles.itemRow}>
            <span style={styles.itemDesc}>{item.description}</span>
            <span style={styles.itemAmount}>${Number(item.amount).toFixed(2)}</span>
          </div>
        ))}

        <div style={styles.divider} />

        <div style={styles.itemRow}>
          <span style={styles.subLabel}>Subtotal</span>
          <span style={styles.subValue}>${Number(invoice.subtotal).toFixed(2)}</span>
        </div>
        <div style={styles.itemRow}>
          <span style={styles.subLabel}>GST (10%)</span>
          <span style={styles.subValue}>${Number(invoice.gst).toFixed(2)}</span>
        </div>
        <div style={styles.itemRow}>
          <span style={styles.totalLabel}>Total</span>
          <span style={styles.totalValue}>${Number(invoice.total).toFixed(2)}</span>
        </div>

        {invoice.status !== 'paid' && stripePromise && !payOpen && (
          <button style={styles.payButton} onClick={startPayNow}>Pay now with card</button>
        )}

        {invoice.status !== 'paid' && payOpen && (
          <div style={{ marginTop: 16 }}>
            {payError && <p style={{ color: '#8A2525', fontSize: 13, marginBottom: 10 }}>{payError}</p>}
            {clientSecret ? (
              <Elements stripe={stripePromise} options={{ clientSecret }}>
                <PayNowForm invoiceId={invoiceId} onPaid={pollUntilPaid} />
              </Elements>
            ) : !payError && (
              <p style={{ color: '#888', fontSize: 13 }}>Loading payment form...</p>
            )}
          </div>
        )}

        <p style={styles.footerNote}>
          {invoice.status === 'paid'
            ? 'This invoice has been marked as paid. Thank you!'
            : `Or arrange payment with ${business?.name || 'your provider'} directly.`}
        </p>
      </div>
      <ClientSupportChat invoiceId={invoiceId} businessName={business?.name} />
    </div>
  )
}

// Card-entry form rendered inside <Elements>. Stripe's own Payment Element
// (an iframe) collects the card number/expiry/CVC directly — this
// component never sees or handles raw card data, only the confirm() call
// and its success/failure result.
function PayNowForm({ invoiceId, onPaid }) {
  const stripe = useStripe()
  const elements = useElements()
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState(null)
  // Set the instant stripe.confirmPayment succeeds — the card has already
  // been charged at that point regardless of how long the webhook takes to
  // mark invoices.status 'paid'. Kept true even if the confirmation poll
  // below (pollUntilPaid, capped at 5 x 1.5s) times out before the webhook
  // lands — without this, a slow webhook meant submitting flipped back to
  // false and this form re-rendered its raw "Confirm payment" button,
  // inviting the client to pay a second time for an invoice that was
  // already successfully charged.
  const [paidPendingSync, setPaidPendingSync] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!stripe || !elements) return
    setSubmitting(true)
    setFormError(null)
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/invoice/${invoiceId}` },
      redirect: 'if_required',
    })
    if (confirmError) {
      setFormError(confirmError.message || 'Payment failed. Please check your card details and try again.')
      setSubmitting(false)
      return
    }
    setPaidPendingSync(true)
    // Webhook (payment_intent.succeeded) marks the invoice paid server-side;
    // onPaid polls for it so the UI reflects it without needing a manual
    // page refresh, and "Processing..." stays shown for the duration.
    await onPaid()
    setSubmitting(false)
  }

  if (paidPendingSync) {
    return <p style={{ color: '#1D9E75', fontSize: 14 }}>✓ Payment received — confirming with your bank now. This page will update automatically when that finishes.</p>
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {formError && <p style={{ color: '#8A2525', fontSize: 13, margin: '10px 0 0' }}>{formError}</p>}
      <button type="submit" disabled={!stripe || submitting} style={{ ...styles.payButton, marginTop: 14, opacity: submitting ? 0.6 : 1 }}>
        {submitting ? 'Processing...' : 'Confirm payment'}
      </button>
    </form>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  card: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 20, padding: 32, maxWidth: 420, width: '100%' },
  bizName: { color: '#555', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', margin: 0 },
  statusBadge: (status) => ({ fontSize: 11, fontWeight: 'bold', letterSpacing: 1, padding: '4px 12px', borderRadius: 20, color: status === 'paid' ? '#1D9E75' : '#A87C16', background: status === 'paid' ? '#1D9E7522' : '#A87C1622', border: `1px solid ${status === 'paid' ? '#1D9E75' : '#A87C16'}` }),
  verifiedNote: { color: '#1D9E75', fontSize: 12, margin: '0 0 10px' },
  clientLine: { color: '#ccc', fontSize: 14, margin: '0 0 2px' },
  dateLine: { color: '#666', fontSize: 12, margin: '0 0 16px' },
  divider: { height: 1, background: '#1e293b', margin: '14px 0' },
  itemRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  itemDesc: { color: '#ccc', fontSize: 14 },
  itemAmount: { color: '#ccc', fontSize: 14 },
  subLabel: { color: '#888', fontSize: 13 },
  subValue: { color: '#888', fontSize: 13 },
  totalLabel: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  totalValue: { color: '#1D9E75', fontSize: 17, fontWeight: 'bold' },
  footerNote: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 24 },
  payButton: { width: '100%', marginTop: 20, padding: '13px 0', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }
}
