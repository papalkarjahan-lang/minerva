import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Client-facing, read-only invoice view (Pro tier). Texted to the client
// via send-invoice-sms once a technician builds the invoice on job
// completion. This displays the invoice and its paid/unpaid status — it
// does not collect payment itself (no payment-processor integration is
// wired up); the business marks it paid once payment is taken on-site
// (card terminal, cash, etc.) or via their own means.
export default function InvoiceView() {
  const { invoiceId } = useParams()
  const [invoice, setInvoice] = useState(null)
  const [business, setBusiness] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { loadInvoice() }, [invoiceId])

  async function loadInvoice() {
    const { data, error: err } = await supabase
      .from('invoices').select('*, businesses(name)').eq('id', invoiceId).single()
    if (err || !data) { setError('This invoice link is invalid or has expired.'); return }
    setInvoice(data)
    setBusiness(data.businesses)
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!invoice) return (
    <div style={styles.screen}>
      <p style={{ color: '#888', fontSize: 16 }}>Loading invoice...</p>
    </div>
  )

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

        <p style={styles.footerNote}>
          {invoice.status === 'paid'
            ? 'This invoice has been marked as paid. Thank you!'
            : `Please arrange payment with ${business?.name || 'your provider'} directly.`}
        </p>
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
  footerNote: { color: '#555', fontSize: 12, textAlign: 'center', marginTop: 24 }
}
