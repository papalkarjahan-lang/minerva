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
  const [tab, setTab] = useState('businesses')
  const [savingId, setSavingId] = useState(null)

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
    setRequests(data || [])
  }

  async function overrideTier(businessId, newTier) {
    setSavingId(businessId)
    await supabase.from('businesses').update({ subscription_tier: newTier }).eq('id', businessId)
    await loadBusinesses()
    setSavingId(null)
  }

  async function resolveRequest(id) {
    await supabase.from('support_requests').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', id)
    loadRequests()
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
            Support ({requests.filter(r => r.status === 'open').length} open)
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
              <div key={r.id} style={{ ...cardStyle, maxWidth: 'none', textAlign: 'left', marginBottom: 12, opacity: r.status === 'resolved' ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <strong style={{ color: '#fff' }}>{r.from_name || 'Unknown'} {r.from_contact ? `(${r.from_contact})` : ''}</strong>
                  <span style={{ color: '#666', fontSize: 12 }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <p style={{ color: '#ccc', margin: '10px 0' }}>{r.message}</p>
                {r.status !== 'resolved' && (
                  <button onClick={() => resolveRequest(r.id)} style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 13 }}>
                    Mark resolved
                  </button>
                )}
              </div>
            ))}
          </div>
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
