import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import LoadingScreen from '../components/LoadingScreen'

// Client-facing, read-only service history page. Round-2 batch (2026-09-04):
// reached via an opaque token (client_portal_links.token, a random UUID —
// NOT the client's phone number) so no PII sits directly in the URL. The
// link itself is generated from TrackingView's job-complete screen ("View
// your service history") and upserted once per (business, client_phone)
// pair, so repeat visits reuse the same link.
export default function ClientHistoryView() {
  const { token } = useParams()
  const [business, setBusiness] = useState(null)
  const [link, setLink] = useState(null)
  const [jobs, setJobs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  // Request-another-job — previously this only existed on TrackingView's
  // job-complete screen (a one-time, easy-to-lose moment right after a
  // job finishes), not on this portal page a client would actually
  // return to and bookmark. Same mechanism as TrackingView's own
  // submitRebooking (insert into `leads`, source='rebooking', then
  // notify-rebooking-request) — not a new pipeline, just making the
  // existing one reachable from the page a repeat client is more likely
  // to actually be on days or weeks later.
  const [showRebook, setShowRebook] = useState(false)
  const [rebookDetails, setRebookDetails] = useState('')
  const [rebookSubmitting, setRebookSubmitting] = useState(false)
  const [rebookDone, setRebookDone] = useState(false)
  const [rebookError, setRebookError] = useState(null)

  useEffect(() => { loadHistory() }, [token])

  async function loadHistory() {
    const { data: link, error: linkErr } = await supabase
      .from('client_portal_links')
      .select('*, businesses(name)')
      .eq('token', token)
      .maybeSingle()
    if (linkErr || !link) { setError('This link is invalid or has expired.'); return }
    setBusiness(link.businesses)
    setLink(link)

    // Both errors checked explicitly (fixed 2026-10-02) — previously a
    // failed fetch here (RLS hiccup, transient network error) left jobList/
    // invoiceList undefined, which rendered identically to a real repeat
    // customer having no history at all: "No history with {business} yet",
    // a misleading thing to tell someone whose request just failed.
    const { data: jobList, error: jobsErr } = await supabase
      .from('jobs')
      .select('*')
      .eq('business_id', link.business_id)
      .eq('client_phone', link.client_phone)
      .order('created_at', { ascending: false })
    if (jobsErr) { setError("Couldn't load your history right now — please try refreshing."); return }
    setJobs(jobList || [])

    const { data: invoiceList, error: invoicesErr } = await supabase
      .from('invoices')
      .select('*')
      .eq('business_id', link.business_id)
      .eq('client_phone', link.client_phone)
      .order('created_at', { ascending: false })
    if (invoicesErr) { setError("Couldn't load your history right now — please try refreshing."); return }
    setInvoices(invoiceList || [])
    setLoaded(true)
  }

  async function submitRebooking() {
    if (rebookSubmitting || !link) return
    setRebookSubmitting(true)
    setRebookError(null)
    const mostRecentJob = jobs[0] || null
    const newLeadId = crypto.randomUUID()
    const { error: insertErr } = await supabase.from('leads').insert({
      id: newLeadId,
      business_id: link.business_id,
      client_name: mostRecentJob?.client_name || null,
      client_phone: link.client_phone,
      suburb: mostRecentJob?.client_address || null,
      urgency: 'routine',
      job_description: rebookDetails.trim() || `Repeat booking request from a past client via their service history page${mostRecentJob?.client_address ? ` (previous job: ${mostRecentJob.client_address})` : ''}.`,
      status: 'new',
      source: 'rebooking',
      is_repeat_client: true,
    })
    setRebookSubmitting(false)
    if (insertErr) { setRebookError("Couldn't send that request — please try again, or call them directly."); return }
    setRebookDone(true)
    supabase.functions.invoke('notify-rebooking-request', { body: { leadId: newLeadId } }).catch(() => {})
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!loaded) return <LoadingScreen label="Loading your history..." />

  const hasHistory = jobs.length > 0 || invoices.length > 0

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <p style={styles.bizName}>{business?.name}</p>
        <h1 style={styles.title}>Your Service History</h1>

        {!hasHistory ? (
          <p style={styles.emptyText}>No history with {business?.name || 'this business'} yet — jobs and invoices will show up here after your first service.</p>
        ) : (
          <>
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
              <a key={inv.id} href={`/invoice/${inv.id}`} target="_blank" rel="noreferrer" style={styles.rowLink}>
                <p style={styles.rowMain}>${Number(inv.total).toFixed(2)} inc. GST</p>
                <p style={styles.rowMeta}>
                  {new Date(inv.created_at).toLocaleDateString('en-AU')} · {inv.status.toUpperCase()}
                </p>
              </a>
            ))}
            {invoices.length === 0 && <p style={styles.emptyText}>No invoices on file yet</p>}
          </>
        )}

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #1e293b' }}>
          {rebookDone ? (
            <p style={{ color: '#8fd0e8', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
              Request sent — {business?.name || 'they'}&rsquo;ll be in touch.
            </p>
          ) : showRebook ? (
            <>
              <label htmlFor="rebook-details" style={{ ...styles.sectionLabel, display: 'block', marginBottom: 8 }}>WHAT DO YOU NEED?</label>
              <textarea
                id="rebook-details"
                value={rebookDetails}
                onChange={e => setRebookDetails(e.target.value)}
                placeholder="Same as last time, or describe what you need (optional)"
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }}
              />
              {rebookError && <p style={{ color: '#e07a7a', fontSize: 13, margin: '0 0 10px' }}>{rebookError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button type="button" disabled={rebookSubmitting} onClick={submitRebooking}
                  style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 'bold', cursor: rebookSubmitting ? 'default' : 'pointer', opacity: rebookSubmitting ? 0.6 : 1 }}>
                  {rebookSubmitting ? 'Sending...' : 'Send request'}
                </button>
                <button type="button" onClick={() => setShowRebook(false)} style={{ background: 'none', border: '1px solid #1e293b', color: '#aaa', borderRadius: 8, padding: '10px 18px', fontSize: 14, cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <button type="button" onClick={() => setShowRebook(true)}
              style={{ width: '100%', background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15, fontWeight: 'bold', cursor: 'pointer' }}>
              Request another job
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  card: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 20, padding: 32, maxWidth: 420, width: '100%' },
  bizName: { color: '#888', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', margin: '0 0 20px' },
  sectionLabel: { color: '#666', fontSize: 11, letterSpacing: 1, fontWeight: 'bold', margin: '0 0 10px' },
  row: { borderBottom: '1px solid #1e293b', padding: '10px 0' },
  rowLink: { display: 'block', borderBottom: '1px solid #1e293b', padding: '10px 0', textDecoration: 'none' },
  rowMain: { color: '#ccc', fontSize: 14, margin: '0 0 2px' },
  rowMeta: { color: '#666', fontSize: 12, margin: 0 },
  emptyText: { color: '#888', fontSize: 13, margin: 0 },
}
