import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Client-facing, read-only service history page. Round-2 batch (2026-09-04):
// reached via an opaque token (client_portal_links.token, a random UUID —
// NOT the client's phone number) so no PII sits directly in the URL. The
// link itself is generated from TrackingView's job-complete screen ("View
// your service history") and upserted once per (business, client_phone)
// pair, so repeat visits reuse the same link.
export default function ClientHistoryView() {
  const { token } = useParams()
  const [business, setBusiness] = useState(null)
  const [jobs, setJobs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { loadHistory() }, [token])

  async function loadHistory() {
    const { data: link, error: linkErr } = await supabase
      .from('client_portal_links')
      .select('*, businesses(name)')
      .eq('token', token)
      .maybeSingle()
    if (linkErr || !link) { setError('This link is invalid or has expired.'); return }
    setBusiness(link.businesses)

    const { data: jobList } = await supabase
      .from('jobs')
      .select('*')
      .eq('business_id', link.business_id)
      .eq('client_phone', link.client_phone)
      .order('created_at', { ascending: false })
    setJobs(jobList || [])

    const { data: invoiceList } = await supabase
      .from('invoices')
      .select('*')
      .eq('business_id', link.business_id)
      .eq('client_phone', link.client_phone)
      .order('created_at', { ascending: false })
    setInvoices(invoiceList || [])
    setLoaded(true)
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!loaded) return (
    <div style={styles.screen}>
      <p style={{ color: '#888', fontSize: 16 }}>Loading your history...</p>
    </div>
  )

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <p style={styles.bizName}>{business?.name}</p>
        <h1 style={styles.title}>Your Service History</h1>

        <p style={styles.sectionLabel}>JOBS</p>
        {jobs.map(job => (
          <div key={job.id} style={styles.row}>
            <p style={styles.rowMain}>{job.client_address || 'Job'}</p>
            <p style={styles.rowMeta}>
              {new Date(job.created_at).toLocaleDateString('en-AU')} · {job.status.toUpperCase()}
            </p>
          </div>
        ))}
        {jobs.length === 0 && <p style={styles.emptyText}>No jobs on file yet</p>}

        <p style={{ ...styles.sectionLabel, marginTop: 20 }}>INVOICES</p>
        {invoices.map(inv => (
          <div key={inv.id} style={styles.row}>
            <p style={styles.rowMain}>${Number(inv.total).toFixed(2)} inc. GST</p>
            <p style={styles.rowMeta}>
              {new Date(inv.created_at).toLocaleDateString('en-AU')} · {inv.status.toUpperCase()}
            </p>
          </div>
        ))}
        {invoices.length === 0 && <p style={styles.emptyText}>No invoices on file yet</p>}
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  card: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 20, padding: 32, maxWidth: 420, width: '100%' },
  bizName: { color: '#555', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', margin: '0 0 20px' },
  sectionLabel: { color: '#666', fontSize: 11, letterSpacing: 1, fontWeight: 'bold', margin: '0 0 10px' },
  row: { borderBottom: '1px solid #1e293b', padding: '10px 0' },
  rowMain: { color: '#ccc', fontSize: 14, margin: '0 0 2px' },
  rowMeta: { color: '#666', fontSize: 12, margin: 0 },
  emptyText: { color: '#444', fontSize: 13, margin: 0 },
}
