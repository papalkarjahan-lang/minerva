import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Internal Minerva staff console — NOT tied to any one business. Gated by
// an admin-email allowlist (VITE_ADMIN_EMAILS, comma-separated) checked
// against the Supabase Auth session set up for RequireBusinessAuth.jsx —
// same login page (/login), different authorization check. This is an
// app-layer gate only (consistent with the rest of this codebase's
// security model, see SECURITY_NOTES.md) — the allowlist ships in the
// client bundle, so treat it as "hides the button from everyone else",
// not as a hard security boundary.
//
// The Support tab is the one exception: support_requests SELECT is now
// enforced at the RLS layer too (supabase_schema_delta_rls_scoping_v1.sql),
// requiring the logged-in user's auth.uid() to appear in the `admin_users`
// table — NOT just be on this client-side email list. If someone is on
// VITE_ADMIN_EMAILS but the Support tab stays empty, it's because no one
// has added their auth.users row to admin_users yet (see that delta's
// header comment for the one-line SQL to do it).
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

const TIERS = ['starter', 'standard', 'pro', 'cancelled']

export default function AdminConsole() {
  const [state, setState] = useState('loading') // loading | unauthenticated | forbidden | ready
  const [session, setSession] = useState(null)
  const [businesses, setBusinesses] = useState([])
  const [requests, setRequests] = useState([])
  const [prospects, setProspects] = useState([])
  const [tab, setTab] = useState('businesses')
  const [savingId, setSavingId] = useState(null)
  const [outreachBusy, setOutreachBusy] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [csvStatus, setCsvStatus] = useState('')

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(currentSession)
      if (!currentSession) { setState('unauthenticated'); return }
      if (!ADMIN_EMAILS.includes((currentSession.user.email || '').toLowerCase())) { setState('forbidden'); return }
      setState('ready')
    }
    check()
    const { data: listener } = supabase.auth.onAuthStateChange(() => check())
    return () => { cancelled = true; listener?.subscription?.unsubscribe() }
  }, [])

  useEffect(() => {
    if (state !== 'ready') return
    loadBusinesses()
    loadRequests()
    loadProspects()
  }, [state])

  async function loadBusinesses() {
    const { data: bizRows } = await supabase
      .from('businesses')
      .select('id, name, sector, subscription_tier, stripe_sub_id, created_at')
      .order('created_at', { ascending: false })
    if (!bizRows) return

    const withStats = await Promise.all(bizRows.map(async (biz) => {
      const { data: techs } = await supabase
        .from('technicians')
        .select('last_seen')
        .eq('business_id', biz.id)
      const techCount = techs?.length || 0
      const lastActivity = (techs || [])
        .map(t => t.last_seen)
        .filter(Boolean)
        .sort()
        .reverse()[0] || null
      return { ...biz, techCount, lastActivity }
    }))
    setBusinesses(withStats)
  }

  async function loadRequests() {
    const { data } = await supabase
      .from('support_requests')
      .select('*')
      .order('created_at', { ascending: false })
    // Urgent-open first, then routine-open, then resolved — see
    // SUPPORT_PLAYBOOK.md for the SLA targets this triage order is meant
    // to support (2hr urgent / 1 business day routine).
    const rank = r => r.status === 'resolved' ? 2 : (r.priority === 'urgent' ? 0 : 1)
    setRequests((data || []).sort((a, b) => rank(a) - rank(b) || new Date(b.created_at) - new Date(a.created_at)))
  }

  async function overrideTier(businessId, newTier) {
    setSavingId(businessId)
    const { error } = await supabase.from('businesses').update({ subscription_tier: newTier }).eq('id', businessId)
    if (error) { alert(`Couldn't update subscription tier: ${error.message}`); setSavingId(null); return }
    await loadBusinesses()
    setSavingId(null)
  }

  async function resolveRequest(id) {
    const { error } = await supabase.from('support_requests').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    if (error) { alert(`Couldn't mark request resolved: ${error.message}`); return }
    loadRequests()
  }

  // --- Outreach pipeline (Minerva's own client acquisition, not a client's) ---
  // See supabase_schema_delta_outreach_engine.sql for the full design note.
  // Nothing here ever sends an email except sendApproved(), and that only
  // ever touches rows already at status='approved' — the send-outreach-batch
  // function itself re-enforces that same filter server-side too, so this
  // client-side gate is a UX convenience, not the only safeguard.
  async function loadProspects() {
    const { data } = await supabase
      .from('outreach_prospects')
      .select('*')
      .order('created_at', { ascending: false })
    setProspects(data || [])
  }

  // Bulk-add via pasted CSV: company_name,contact_name,contact_email,trade_type,city
  // — solves the "can't hand-type enough prospects" bottleneck at the data-
  // entry stage; draftOutreach() below solves it at the writing stage.
  async function importCsv() {
    const lines = csvText.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) { setCsvStatus('Paste at least one line first.'); return }
    const rows = lines.map(line => {
      const [company_name, contact_name, contact_email, trade_type, city] = line.split(',').map(v => v?.trim())
      return { company_name, contact_name: contact_name || null, contact_email: contact_email || null, trade_type: trade_type || null, city: city || null, source: 'manual' }
    }).filter(r => r.company_name)
    if (rows.length === 0) { setCsvStatus('No valid rows found — expected: company_name,contact_name,contact_email,trade_type,city'); return }
    const { error } = await supabase.from('outreach_prospects').insert(rows)
    if (error) { setCsvStatus(`Import failed: ${error.message}`); return }
    setCsvStatus(`Imported ${rows.length} prospect(s).`)
    setCsvText('')
    loadProspects()
  }

  async function draftOutreach() {
    setOutreachBusy(true)
    const { data, error } = await supabase.functions.invoke('draft-outreach-batch', { body: {} })
    setOutreachBusy(false)
    if (error) { alert(`Drafting failed: ${error.message}`); return }
    alert(`Drafted ${data?.drafted ?? 0} email(s) (${data?.aiDrafted ?? 0} AI-personalized, ${data?.fallbackUsed ?? 0} plain-template — review both before approving).`)
    loadProspects()
  }

  async function saveDraft(id, draft_subject, draft_body) {
    setSavingId(id)
    await supabase.from('outreach_prospects').update({ draft_subject, draft_body }).eq('id', id)
    setSavingId(null)
    loadProspects()
  }

  async function approveProspect(id) {
    await supabase.from('outreach_prospects').update({ status: 'approved' }).eq('id', id)
    loadProspects()
  }

  async function rejectProspect(id) {
    await supabase.from('outreach_prospects').update({ status: 'closed_lost' }).eq('id', id)
    loadProspects()
  }

  async function sendApproved() {
    const approvedCount = prospects.filter(p => p.status === 'approved').length
    if (approvedCount === 0) { alert('No approved prospects to send.'); return }
    if (!window.confirm(`Send ${approvedCount} approved outreach email(s) now? This actually sends real emails.`)) return
    setOutreachBusy(true)
    const { data, error } = await supabase.functions.invoke('send-outreach-batch', { body: {} })
    setOutreachBusy(false)
    if (error) { alert(`Send failed: ${error.message}`); return }
    alert(`Sent ${data?.sent ?? 0}, skipped (no email) ${data?.skippedNoEmail ?? 0}, failed ${data?.failed ?? 0}.`)
    loadProspects()
  }

  if (state === 'loading') {
    return <div style={pageStyle}><p style={{ color: '#888' }}>Loading...</p></div>
  }

  if (state === 'unauthenticated' || state === 'forbidden') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', margin: '0 0 12px' }}>
            {state === 'forbidden' ? 'Not authorized' : 'Please log in'}
          </p>
          <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 24px' }}>
            {state === 'forbidden' ? "This account isn't on the admin allowlist." : 'Admin console requires login.'}
          </p>
          <Link to="/login" style={{ display: 'inline-block', background: '#2D5FA8', color: '#fff', textDecoration: 'none', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 'bold' }}>
            Go to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050811', fontFamily: 'Arial, sans-serif', padding: 32 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <h1 style={{ color: '#fff', fontSize: 24 }}>Minerva Admin</h1>
          <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: '1px solid #1e293b', color: '#aaa', borderRadius: 8, padding: '8px 16px', cursor: 'pointer' }}>
            Log out ({session.user.email})
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <button onClick={() => setTab('businesses')} style={tabStyle(tab === 'businesses')}>Businesses ({businesses.length})</button>
          <button onClick={() => setTab('support')} style={tabStyle(tab === 'support')}>
            Support ({requests.filter(r => r.status === 'open').length} open
            {requests.some(r => r.status === 'open' && r.priority === 'urgent') &&
              `, ${requests.filter(r => r.status === 'open' && r.priority === 'urgent').length} urgent`})
          </button>
          <button onClick={() => setTab('outreach')} style={tabStyle(tab === 'outreach')}>
            Outreach ({prospects.filter(p => p.status === 'drafted').length} to review, {prospects.filter(p => p.status === 'approved').length} ready to send)
          </button>
        </div>

        {tab === 'businesses' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', color: '#ccc', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: '#8fd0e8', borderBottom: '1px solid #1e293b' }}>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Sector</th>
                <th style={thStyle}>Tier</th>
                <th style={thStyle}>Stripe</th>
                <th style={thStyle}>Techs</th>
                <th style={thStyle}>Last activity</th>
                <th style={thStyle}>Signed up</th>
              </tr>
            </thead>
            <tbody>
              {businesses.map(biz => (
                <tr key={biz.id} style={{ borderBottom: '1px solid #131b2e' }}>
                  <td style={tdStyle}>{biz.name}</td>
                  <td style={tdStyle}>{biz.sector || 'trade'}</td>
                  <td style={tdStyle}>
                    <select
                      value={biz.subscription_tier || ''}
                      disabled={savingId === biz.id}
                      onChange={e => overrideTier(biz.id, e.target.value)}
                      style={{ background: '#0a0f1d', color: '#fff', border: '1px solid #1e293b', borderRadius: 6, padding: '4px 8px' }}
                    >
                      {TIERS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}>{biz.stripe_sub_id ? '✅' : '—'}</td>
                  <td style={tdStyle}>{biz.techCount}</td>
                  <td style={tdStyle}>{biz.lastActivity ? new Date(biz.lastActivity).toLocaleString() : 'never'}</td>
                  <td style={tdStyle}>{new Date(biz.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === 'support' && (
          <div>
            {requests.length === 0 && <p style={{ color: '#888' }}>No support requests.</p>}
            {requests.map(r => (
              <div key={r.id} style={{ ...cardStyle, maxWidth: 'none', textAlign: 'left', marginBottom: 12, opacity: r.status === 'resolved' ? 0.5 : 1, border: r.status !== 'resolved' && r.priority === 'urgent' ? '1px solid #8A2525' : cardStyle.border }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ color: '#fff' }}>
                    {r.priority === 'urgent' && r.status !== 'resolved' && <span style={{ color: '#e05555', marginRight: 6 }}>⚠ URGENT</span>}
                    {r.from_name || 'Unknown'} {r.from_contact ? `(${r.from_contact})` : ''}
                  </strong>
                  <span style={{ color: '#666', fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p style={{ color: '#ccc', margin: '10px 0' }}>{r.message}</p>
                <div style={{ display: 'flex', gap: 10 }}>
                  {r.status !== 'resolved' && (
                    <button onClick={() => resolveRequest(r.id)} style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
                      Mark resolved
                    </button>
                  )}
                  {r.from_contact?.includes('@') && (
                    <a href={`mailto:${r.from_contact}?subject=${encodeURIComponent('Re: your Minerva support request')}`}
                      style={{ color: '#8fd0e8', fontSize: 13, alignSelf: 'center', textDecoration: 'none' }}>
                      Reply by email →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'outreach' && (
          <div>
            <div style={{ ...cardStyle, maxWidth: 'none', textAlign: 'left', marginBottom: 20 }}>
              <p style={{ color: '#fff', fontWeight: 'bold', margin: '0 0 8px' }}>1. Add prospects</p>
              <p style={{ color: '#888', fontSize: 13, margin: '0 0 10px' }}>
                Paste one prospect per line: <code>company_name,contact_name,contact_email,trade_type,city</code>
              </p>
              <textarea
                value={csvText}
                onChange={e => setCsvText(e.target.value)}
                placeholder="Fergusons Plumbing,Dave Ferguson,dave@fergusonsplumbing.com.au,plumbing,Melbourne"
                style={{ width: '100%', minHeight: 100, background: '#0a0f1d', color: '#fff', border: '1px solid #1e293b', borderRadius: 8, padding: 10, fontFamily: 'monospace', fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                <button onClick={importCsv} style={{ background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                  Import
                </button>
                {csvStatus && <span style={{ color: '#8fd0e8', fontSize: 13 }}>{csvStatus}</span>}
              </div>
            </div>

            <div style={{ ...cardStyle, maxWidth: 'none', textAlign: 'left', marginBottom: 20 }}>
              <p style={{ color: '#fff', fontWeight: 'bold', margin: '0 0 8px' }}>2. Draft, then 3. review/edit each one below, then 4. send</p>
              <p style={{ color: '#888', fontSize: 13, margin: '0 0 10px' }}>
                Drafting never sends anything. Sending only ever goes out to prospects you've personally clicked "Approve" on below.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={draftOutreach} disabled={outreachBusy} style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: outreachBusy ? 'default' : 'pointer', fontSize: 13, opacity: outreachBusy ? 0.6 : 1 }}>
                  {outreachBusy ? 'Working...' : `Draft new (${prospects.filter(p => p.status === 'new').length} pending)`}
                </button>
                <button onClick={sendApproved} disabled={outreachBusy} style={{ background: '#8A2525', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: outreachBusy ? 'default' : 'pointer', fontSize: 13, opacity: outreachBusy ? 0.6 : 1 }}>
                  {outreachBusy ? 'Working...' : `Send approved (${prospects.filter(p => p.status === 'approved').length})`}
                </button>
              </div>
            </div>

            {prospects.filter(p => ['drafted', 'approved'].includes(p.status)).length === 0 && (
              <p style={{ color: '#888' }}>No drafts waiting on review right now.</p>
            )}
            {prospects.filter(p => ['drafted', 'approved'].includes(p.status)).map(p => (
              <ProspectCard key={p.id} prospect={p} onSaveDraft={saveDraft} onApprove={approveProspect} onReject={rejectProspect} savingId={savingId} />
            ))}

            <p style={{ color: '#555', fontSize: 12, marginTop: 24 }}>
              {prospects.filter(p => p.status === 'sent').length} sent · {prospects.filter(p => p.status === 'replied' || p.replied_at).length} replied · {prospects.filter(p => p.status === 'closed_won').length} closed won · {prospects.filter(p => p.status === 'closed_lost').length} closed lost
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ProspectCard({ prospect: p, onSaveDraft, onApprove, onReject, savingId }) {
  const [subject, setSubject] = useState(p.draft_subject || '')
  const [body, setBody] = useState(p.draft_body || '')
  const dirty = subject !== (p.draft_subject || '') || body !== (p.draft_body || '')

  return (
    <div style={{ ...cardStyle, maxWidth: 'none', textAlign: 'left', marginBottom: 14, border: p.status === 'approved' ? '1px solid #1D9E75' : cardStyle.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ color: '#fff' }}>{p.company_name}{p.followup_stage > 0 ? ` (follow-up #${p.followup_stage})` : ''}</strong>
        <span style={{ color: p.status === 'approved' ? '#1D9E75' : '#8fd0e8', fontSize: 12, textTransform: 'uppercase' }}>{p.status}</span>
      </div>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 10px' }}>
        {p.contact_name || 'unknown contact'} · {p.contact_email || 'no email on file'} · {p.trade_type || 'unknown trade'}{p.city ? ` · ${p.city}` : ''}
      </p>
      <input
        value={subject}
        onChange={e => setSubject(e.target.value)}
        style={{ width: '100%', background: '#0a0f1d', color: '#fff', border: '1px solid #1e293b', borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 13 }}
      />
      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        style={{ width: '100%', minHeight: 120, background: '#0a0f1d', color: '#ccc', border: '1px solid #1e293b', borderRadius: 6, padding: 8, fontSize: 13, whiteSpace: 'pre-wrap' }}
      />
      <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
        {dirty && (
          <button onClick={() => onSaveDraft(p.id, subject, body)} disabled={savingId === p.id} style={{ background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
            Save edits
          </button>
        )}
        {p.status === 'drafted' && !dirty && (
          <button onClick={() => onApprove(p.id)} style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
            Approve for sending
          </button>
        )}
        {p.status !== 'closed_lost' && (
          <button onClick={() => onReject(p.id)} style={{ background: 'none', border: '1px solid #1e293b', color: '#888', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
            Discard
          </button>
        )}
      </div>
    </div>
  )
}

const pageStyle = { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 }
const cardStyle = { background: '#0a0f1d', borderRadius: 20, padding: 40, maxWidth: 420, width: '100%', textAlign: 'center', border: '1px solid #1e293b' }
const thStyle = { padding: '8px 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }
const tdStyle = { padding: '10px 12px' }
function tabStyle(active) {
  return { background: active ? '#2D5FA8' : 'transparent', color: '#fff', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14 }
}
