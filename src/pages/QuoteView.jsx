import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Client-facing, read-only-ish quote view. Texted to the client via
// send-quote-sms once a dispatcher approves and sends a drafted quote.
// Unlike InvoiceView, the client CAN act here — Accept/Decline are plain
// status updates on their own quote row (not an outbound message Minerva
// sends on the business's behalf, so this doesn't need the Sales &
// Marketing human-approval gate). Minerva still collects no payment here.
export default function QuoteView() {
  const { quoteId } = useParams()
  const [quote, setQuote] = useState(null)
  const [business, setBusiness] = useState(null)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadQuote() }, [quoteId])

  async function loadQuote() {
    const { data, error: err } = await supabase
      .from('quotes').select('*, businesses(*)').eq('id', quoteId).single()
    if (err || !data) { setError('This quote link is invalid or has expired.'); return }
    setQuote(data)
    setBusiness(data.businesses)
  }

  async function respond(status) {
    setSubmitting(true)
    await supabase.from('quotes').update({ status }).eq('id', quoteId)
    setQuote(prev => ({ ...prev, status }))
    setSubmitting(false)
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!quote) return (
    <div style={styles.screen}>
      <p style={{ color: '#888', fontSize: 16 }}>Loading quote...</p>
    </div>
  )

  const items = Array.isArray(quote.line_items) ? quote.line_items : []

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <p style={styles.bizName}>{business?.name}</p>
            <h1 style={styles.title}>Quote</h1>
          </div>
          <span style={styles.statusBadge(quote.status)}>{quote.status.toUpperCase()}</span>
        </div>

        <p style={styles.clientLine}>For: <strong>{quote.client_name || 'Client'}</strong></p>
        <p style={styles.dateLine}>{new Date(quote.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <p style={styles.descText}>{quote.description}</p>

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
          <span style={styles.subValue}>${Number(quote.subtotal).toFixed(2)}</span>
        </div>
        <div style={styles.itemRow}>
          <span style={styles.subLabel}>GST (10%)</span>
          <span style={styles.subValue}>${Number(quote.gst).toFixed(2)}</span>
        </div>
        <div style={styles.itemRow}>
          <span style={styles.totalLabel}>Total</span>
          <span style={styles.totalValue}>${Number(quote.total).toFixed(2)}</span>
        </div>

        {quote.status === 'sent' && (
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" style={styles.declineBtn} onClick={() => respond('declined')} disabled={submitting}>
              Decline
            </button>
            <button type="button" style={styles.acceptBtn} onClick={() => respond('accepted')} disabled={submitting}>
              Accept Quote
            </button>
          </div>
        )}
        {quote.status === 'accepted' && (
          <p style={styles.footerNote}>You've accepted this quote — {business?.name || 'the business'} will be in touch to schedule.</p>
        )}
        {quote.status === 'declined' && (
          <p style={styles.footerNote}>You've declined this quote.</p>
        )}
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  card: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 20, padding: 32, maxWidth: 420, width: '100%' },
  bizName: { color: '#555', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', margin: 0 },
  statusBadge: (status) => ({ fontSize: 11, fontWeight: 'bold', letterSpacing: 1, padding: '4px 12px', borderRadius: 20, color: status === 'accepted' ? '#1D9E75' : status === 'declined' ? '#8A2525' : '#A87C16', background: status === 'accepted' ? '#1D9E7522' : status === 'declined' ? '#8A252522' : '#A87C1622', border: `1px solid ${status === 'accepted' ? '#1D9E75' : status === 'declined' ? '#8A2525' : '#A87C16'}` }),
  clientLine: { color: '#ccc', fontSize: 14, margin: '0 0 2px' },
  dateLine: { color: '#666', fontSize: 12, margin: '0 0 10px' },
  descText: { color: '#8899a6', fontSize: 13, margin: '0 0 16px', fontStyle: 'italic' },
  divider: { height: 1, background: '#1e293b', margin: '14px 0' },
  itemRow: { display: 'flex', justifyContent: 'space-between', marginBottom: 8 },
  itemDesc: { color: '#ccc', fontSize: 14 },
  itemAmount: { color: '#ccc', fontSize: 14 },
  subLabel: { color: '#888', fontSize: 13 },
  subValue: { color: '#888', fontSize: 13 },
  totalLabel: { color: '#fff', fontSize: 17, fontWeight: 'bold' },
  totalValue: { color: '#1D9E75', fontSize: 17, fontWeight: 'bold' },
  footerNote: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 24 },
  acceptBtn: { flex: 2, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' },
  declineBtn: { flex: 1, background: '#1e293b', color: '#ccc', border: 'none', borderRadius: 8, padding: '12px 0', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' },
}
