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
const COMPANY_TYPES = ['multi_van', 'facilities_management', 'council', 'strata', 'other']
const STAGES = ['researching', 'contacted', 'discovery_call', 'proposal_sent', 'negotiating', 'closed_won', 'closed_lost']

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
  const [pasteText, setPasteText] = useState('')
  const [pasteBusy, setPasteBusy] = useState(false)
  const [pasteStatus, setPasteStatus] = useState('')
  const [proposalLinks, setProposalLinks] = useState({})
  const [roiBusyId, setRoiBusyId] = useState(null)
  const [bigAccounts, setBigAccounts] = useState([])
  const [newTarget, setNewTarget] = useState({ company_name: '', company_type: 'multi_van', contact_name: '', contact_title: '', contact_email: '', contact_phone: '', estimated_fleet_size: '', region: '' })
  const [bigAccountBusy, setBigAccountBusy] = useState(null)

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
    loadBigAccounts()
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

  // Alternate import path for prospects copied by hand off a directory
  // listing/LinkedIn page/etc. rather than typed as clean CSV — see
  // parse-prospect-text/index.ts's HONESTY NOTE for why this is not scraping.
  async function importPastedText() {
    if (!pasteText.trim()) { setPasteStatus('Paste some text first.'); return }
    setPasteBusy(true)
    const { data, error } = await supabase.functions.invoke('parse-prospect-text', { body: { text: pasteText } })
    setPasteBusy(false)
    if (error) { setPasteStatus(`Extraction failed: ${error.message}`); return }
    if (data?.error) { setPasteStatus(data.error); return }
    setPasteStatus(data?.note || `Imported ${data?.inserted ?? 0} prospect(s).`)
    setPasteText('')
    loadProspects()
  }

  // Generates a shareable /proposal/:id ROI one-pager for a big-account
  // prospect — see generate-roi-proposal/index.ts. Never sent automatically;
  // the operator copies the resulting link and shares it personally.
  async function generateProposal(prospect, fleetSize) {
    const n = Number(fleetSize)
    if (!n || n <= 0) { alert('Enter a fleet size (number of vehicles/technicians) first.'); return }
    setRoiBusyId(prospect.id)
    const { data, error } = await supabase.functions.invoke('generate-roi-proposal', {
      body: { prospectId: prospect.id, companyName: prospect.company_name, contactName: prospect.contact_name, tradeType: prospect.trade_type, fleetSize: n },
    })
    setRoiBusyId(null)
    if (error) { alert(`Couldn't generate proposal: ${error.message}`); return }
    setProposalLinks(prev => ({ ...prev, [prospect.id]: data.proposalId }))
  }

  // --- Big Accounts pipeline (the 5-10 named multi-van/FM/council/strata
  // targets from BIG_CONTRACTS_PLAYBOOK.md) — separate from the SMB
  // outreach_prospects flow above because these deals run 3-6+ months with
  // multiple stakeholders, not a single draft->send->reply email. Every row
  // is entered/edited by hand; see BIG_ACCOUNT_EXECUTION_KIT.md for the
  // discovery-call script and objection handling to use alongside this.
  async function loadBigAccounts() {
    const { data } = await supabase
      .from('big_account_targets')
      .select('*')
      .order('next_action_date', { ascending: true, nullsFirst: false })
    setBigAccounts(data || [])
    if (data && data.length > 0) {
      const { data: proposals } = await supabase
        .from('roi_proposals')
        .select('id, big_account_target_id')
        .in('big_account_target_id', data.map(t => t.id))
      if (proposals) {
        setProposalLinks(prev => {
          const next = { ...prev }
          proposals.forEach(p => { if (p.big_account_target_id) next[p.big_account_target_id] = p.id })
          return next
        })
      }
    }
  }

  async function addBigAccount() {
    if (!newTarget.company_name.trim()) { alert('Company name is required.'); return }
    const { error } = await supabase.from('big_account_targets').insert({
      ...newTarget,
      estimated_fleet_size: newTarget.estimated_fleet_size ? Number(newTarget.estimated_fleet_size) : null,
    })
    if (error) { alert(`Couldn't add target: ${error.message}`); return }
    setNewTarget({ company_name: '', company_type: 'multi_van', contact_name: '', contact_title: '', contact_email: '', contact_phone: '', estimated_fleet_size: '', region: '' })
    loadBigAccounts()
  }

  async function saveBigAccount(id, patch) {
    setBigAccountBusy(id)
    const { error } = await supabase.from('big_account_targets').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
    setBigAccountBusy(null)
    if (error) { alert(`Couldn't save: ${error.message}`); return }
    loadBigAccounts()
  }

  async function generateProposalForTarget(target, fleetSize) {
    const n = Number(fleetSize) || target.estimated_fleet_size
    if (!n || n <= 0) { alert('Enter a fleet size first.'); return }
    setRoiBusyId(target.id)
    const { data, error } = await supabase.functions.invoke('generate-roi-proposal', {
      body: { bigAccountTargetId: target.id, companyName: target.company_name, contactName: target.contact_name, tradeType: target.company_type, fleetSize: n },
    })
    setRoiBusyId(null)
    if (error) { alert(`Couldn't generate proposal: ${error.message}`); return }
    setProposalLinks(prev => ({ ...prev, [target.id]: data.proposalId }))
    loadBigAccounts() // pick up the auto-advanced stage
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
          <button onClick={() => setTab('bigaccounts')} style={tabStyle(tab === 'bigaccounts')}>
            Big Accounts ({bigAccounts.filter(t => !['closed_won', 'closed_lost'].includes(t.stage)).length} active)
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

              <div style={{ height: 1, background: '#1e293b', margin: '16px 0' }} />

              <p style={{ color: '#888', fontSize: 13, margin: '0 0 10px' }}>
                Or paste messy text you copied by hand off a directory listing, LinkedIn page, or
                similar (AI extracts the rows for you — nothing here fetches any website itself).
              </p>
              <textarea
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                placeholder="Paste the raw copied text here..."
                style={{ width: '100%', minHeight: 100, background: '#0a0f1d', color: '#fff', border: '1px solid #1e293b', borderRadius: 8, padding: 10, fontSize: 13 }}
              />
              <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center' }}>
                <button onClick={importPastedText} disabled={pasteBusy} style={{ background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: pasteBusy ? 'default' : 'pointer', fontSize: 13, opacity: pasteBusy ? 0.6 : 1 }}>
                  {pasteBusy ? 'Extracting...' : 'Extract & import (AI)'}
                </button>
                {pasteStatus && <span style={{ color: '#8fd0e8', fontSize: 13 }}>{pasteStatus}</span>}
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
              <ProspectCard
                key={p.id}
                prospect={p}
                onSaveDraft={saveDraft}
                onApprove={approveProspect}
                onReject={rejectProspect}
                savingId={savingId}
                onGenerateProposal={generateProposal}
                proposalId={proposalLinks[p.id]}
                roiBusy={roiBusyId === p.id}
              />
            ))}

            <p style={{ color: '#555', fontSize: 12, marginTop: 24 }}>
              {prospects.filter(p => p.status === 'sent').length} sent · {prospects.filter(p => p.status === 'replied' || p.replied_at).length} replied · {prospects.filter(p => p.status === 'closed_won').length} closed won · {prospects.filter(p => p.status === 'closed_lost').length} closed lost
            </p>
          </div>
        )}

        {tab === 'bigaccounts' && (
          <div>
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 16px' }}>
              The 5-10 named multi-van/FM/council/strata targets from <code>BIG_CONTRACTS_PLAYBOOK.md</code> —
              one of these closing is worth 20-40 typical SMB deals. See <code>BIG_ACCOUNT_EXECUTION_KIT.md</code>{' '}
              for the discovery-call script, objection handling, and why each type would realistically say yes.
              Nothing here sends anything — this is a tracker, and a per-target ROI proposal generator.
            </p>

            <div style={{ ...cardStyle, maxWidth: 'none', textAlign: 'left', marginBottom: 20 }}>
              <p style={{ color: '#fff', fontWeight: 'bold', margin: '0 0 10px' }}>Add a target</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <input placeholder="Company name" value={newTarget.company_name} onChange={e => setNewTarget({ ...newTarget, company_name: e.target.value })} style={{ ...inputStyle, width: 200 }} />
                <select value={newTarget.company_type} onChange={e => setNewTarget({ ...newTarget, company_type: e.target.value })} style={{ ...inputStyle, width: 160 }}>
                  {COMPANY_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
                </select>
                <input placeholder="Contact name" value={newTarget.contact_name} onChange={e => setNewTarget({ ...newTarget, contact_name: e.target.value })} style={{ ...inputStyle, width: 150 }} />
                <input placeholder="Title" value={newTarget.contact_title} onChange={e => setNewTarget({ ...newTarget, contact_title: e.target.value })} style={{ ...inputStyle, width: 130 }} />
                <input placeholder="Email" value={newTarget.contact_email} onChange={e => setNewTarget({ ...newTarget, contact_email: e.target.value })} style={{ ...inputStyle, width: 180 }} />
                <input placeholder="Phone" value={newTarget.contact_phone} onChange={e => setNewTarget({ ...newTarget, contact_phone: e.target.value })} style={{ ...inputStyle, width: 130 }} />
                <input type="number" min="1" placeholder="Est. fleet size" value={newTarget.estimated_fleet_size} onChange={e => setNewTarget({ ...newTarget, estimated_fleet_size: e.target.value })} style={{ ...inputStyle, width: 110 }} />
                <input placeholder="Region" value={newTarget.region} onChange={e => setNewTarget({ ...newTarget, region: e.target.value })} style={{ ...inputStyle, width: 130 }} />
              </div>
              <button onClick={addBigAccount} style={{ background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13 }}>
                Add target
              </button>
            </div>

            {bigAccounts.filter(t => !['closed_won', 'closed_lost'].includes(t.stage)).length === 0 && (
              <p style={{ color: '#888' }}>No active big-account targets yet — add the first one above.</p>
            )}
            {bigAccounts.filter(t => !['closed_won', 'closed_lost'].includes(t.stage)).map(t => (
              <BigAccountCard
                key={t.id}
                target={t}
                onSave={saveBigAccount}
                onGenerateProposal={generateProposalForTarget}
                proposalId={proposalLinks[t.id]}
                roiBusy={roiBusyId === t.id}
                busy={bigAccountBusy === t.id}
              />
            ))}

            <p style={{ color: '#555', fontSize: 12, marginTop: 24 }}>
              {bigAccounts.filter(t => t.stage === 'closed_won').length} closed won · {bigAccounts.filter(t => t.stage === 'closed_lost').length} closed lost
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function ProspectCard({ prospect: p, onSaveDraft, onApprove, onReject, savingId, onGenerateProposal, proposalId, roiBusy }) {
  const [subject, setSubject] = useState(p.draft_subject || '')
  const [body, setBody] = useState(p.draft_body || '')
  const [fleetSize, setFleetSize] = useState('')
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

      {/* Big-account pitch tool — see BIG_CONTRACTS_PLAYBOOK.md. Only worth
          using on a multi-van/multi-tech prospect, hence asking fleet size
          rather than generating this for every single-van SMB by default. */}
      <div style={{ borderTop: '1px solid #1e293b', marginTop: 12, paddingTop: 10, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ color: '#666', fontSize: 12 }}>Multi-van/big account? Fleet size:</span>
        <input
          type="number" min="1" value={fleetSize} onChange={e => setFleetSize(e.target.value)}
          placeholder="e.g. 12"
          style={{ width: 70, background: '#0a0f1d', color: '#fff', border: '1px solid #1e293b', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
        />
        <button
          onClick={() => onGenerateProposal(p, fleetSize)}
          disabled={roiBusy}
          style={{ background: 'none', border: '1px solid #2D5FA8', color: '#8fd0e8', borderRadius: 8, padding: '5px 12px', cursor: roiBusy ? 'default' : 'pointer', fontSize: 12, opacity: roiBusy ? 0.6 : 1 }}
        >
          {roiBusy ? 'Generating...' : 'Generate ROI proposal'}
        </button>
        {proposalId && (
          <a href={`/proposal/${proposalId}`} target="_blank" rel="noreferrer" style={{ color: '#1D9E75', fontSize: 12 }}>
            /proposal/{proposalId} →
          </a>
        )}
      </div>
    </div>
  )
}

function BigAccountCard({ target: t, onSave, onGenerateProposal, proposalId, roiBusy, busy }) {
  const [stage, setStage] = useState(t.stage)
  const [nextAction, setNextAction] = useState(t.next_action || '')
  const [nextActionDate, setNextActionDate] = useState(t.next_action_date || '')
  const [notes, setNotes] = useState(t.notes || '')
  const [fleetSize, setFleetSize] = useState(t.estimated_fleet_size || '')
  const dirty = stage !== t.stage || nextAction !== (t.next_action || '') || nextActionDate !== (t.next_action_date || '') || notes !== (t.notes || '')

  return (
    <div style={{ ...cardStyle, maxWidth: 'none', textAlign: 'left', marginBottom: 14, border: stage === 'negotiating' ? '1px solid #1D9E75' : cardStyle.border }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ color: '#fff' }}>{t.company_name}</strong>
        <span style={{ color: '#8fd0e8', fontSize: 12, textTransform: 'uppercase' }}>{(t.company_type || '').replace('_', ' ')}</span>
      </div>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 10px' }}>
        {t.contact_name || 'unknown contact'}{t.contact_title ? ` (${t.contact_title})` : ''} ·{' '}
        {t.contact_email || 'no email'} · {t.contact_phone || 'no phone'} ·{' '}
        est. fleet {t.estimated_fleet_size || '?'}{t.region ? ` · ${t.region}` : ''}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <select value={stage} onChange={e => setStage(e.target.value)} style={{ ...inputStyle, width: 160 }}>
          {STAGES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
        </select>
        <input placeholder="Next action (e.g. call Dave back)" value={nextAction} onChange={e => setNextAction(e.target.value)} style={{ ...inputStyle, width: 220 }} />
        <input type="date" value={nextActionDate || ''} onChange={e => setNextActionDate(e.target.value)} style={{ ...inputStyle, width: 140 }} />
      </div>
      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        placeholder="Running notes — call summaries, objections raised, who else is involved in the decision..."
        style={{ width: '100%', minHeight: 70, background: '#0a0f1d', color: '#ccc', border: '1px solid #1e293b', borderRadius: 6, padding: 8, fontSize: 13 }}
      />

      <div style={{ display: 'flex', gap: 10, marginTop: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {dirty && (
          <button
            onClick={() => onSave(t.id, { stage, next_action: nextAction || null, next_action_date: nextActionDate || null, notes: notes || null })}
            disabled={busy}
            style={{ background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}
          >
            Save
          </button>
        )}
        <input
          type="number" min="1" value={fleetSize} onChange={e => setFleetSize(e.target.value)}
          placeholder="Fleet size"
          style={{ width: 90, background: '#0a0f1d', color: '#fff', border: '1px solid #1e293b', borderRadius: 6, padding: '4px 8px', fontSize: 13 }}
        />
        <button
          onClick={() => onGenerateProposal(t, fleetSize)}
          disabled={roiBusy}
          style={{ background: 'none', border: '1px solid #2D5FA8', color: '#8fd0e8', borderRadius: 8, padding: '5px 12px', cursor: roiBusy ? 'default' : 'pointer', fontSize: 12, opacity: roiBusy ? 0.6 : 1 }}
        >
          {roiBusy ? 'Generating...' : proposalId ? 'Regenerate ROI proposal' : 'Generate ROI proposal'}
        </button>
        {proposalId && (
          <a href={`/proposal/${proposalId}`} target="_blank" rel="noreferrer" style={{ color: '#1D9E75', fontSize: 12 }}>
            /proposal/{proposalId} →
          </a>
        )}
      </div>
    </div>
  )
}

const pageStyle = { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 }
const cardStyle = { background: '#0a0f1d', borderRadius: 20, padding: 40, maxWidth: 420, width: '100%', textAlign: 'center', border: '1px solid #1e293b' }
const thStyle = { padding: '8px 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }
const tdStyle = { padding: '10px 12px' }
const inputStyle = { background: '#0a0f1d', color: '#fff', border: '1px solid #1e293b', borderRadius: 6, padding: '6px 10px', fontSize: 13 }
function tabStyle(active) {
  return { background: active ? '#2D5FA8' : 'transparent', color: '#fff', border: '1px solid #1e293b', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 14 }
}
