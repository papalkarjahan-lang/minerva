import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Wraps /dispatch/:businessId and /industrial/:businessId. Additive
// app-layer auth gate — see supabase_schema_delta_owner_auth.sql for why
// this checks ownership at the app layer rather than via RLS (RLS is
// unchanged, still `using (true)` on every table, deliberately, this batch).
//
// Auto-claim: existing pilot businesses were created before any auth
// existed, so owner_user_id is null for all of them. The first time their
// contact_email logs in, this claims the business for that user
// automatically — no migration/manual step needed for the pilots already
// running.
export default function RequireBusinessAuth({ children }) {
  const { businessId } = useParams()
  const [state, setState] = useState('loading') // loading | unauthenticated | authorized | forbidden
  const [session, setSession] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function check() {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (cancelled) return
      setSession(currentSession)
      if (!currentSession) { setState('unauthenticated'); return }

      const { data: biz, error } = await supabase
        .from('businesses')
        .select('id, owner_user_id, contact_email')
        .eq('id', businessId)
        .maybeSingle()
      if (cancelled) return
      if (error || !biz) { setState('forbidden'); return }

      if (biz.owner_user_id === currentSession.user.id) { setState('authorized'); return }

      if (!biz.owner_user_id && biz.contact_email && currentSession.user.email &&
          biz.contact_email.toLowerCase() === currentSession.user.email.toLowerCase()) {
        const { error: claimErr } = await supabase
          .from('businesses')
          .update({ owner_user_id: currentSession.user.id })
          .eq('id', businessId)
          .is('owner_user_id', null) // don't overwrite a claim that landed between our read and this write
        if (!cancelled) setState(claimErr ? 'forbidden' : 'authorized')
        return
      }

      setState('forbidden')
    }

    check()
    const { data: listener } = supabase.auth.onAuthStateChange(() => check())
    return () => { cancelled = true; listener?.subscription?.unsubscribe() }
  }, [businessId])

  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#050811' }}>
        <p style={{ color: '#888', fontFamily: 'Arial, sans-serif', fontSize: 16 }}>Loading...</p>
      </div>
    )
  }

  if (state === 'unauthenticated' || state === 'forbidden') {
    return (
      <div style={{ minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 }}>
        <div style={{ background: '#0a0f1d', borderRadius: 20, padding: 48, maxWidth: 420, width: '100%', textAlign: 'center', border: '1px solid #1e293b' }}>
          <p style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', margin: '0 0 12px' }}>
            {state === 'forbidden' ? 'Not authorized' : 'Please log in'}
          </p>
          <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 24px', lineHeight: 1.5 }}>
            {state === 'forbidden'
              ? "This account isn't linked to this business."
              : 'Log in with the email you signed up with to open your console.'}
          </p>
          <Link to="/login" style={{ display: 'inline-block', background: '#2D5FA8', color: '#fff', textDecoration: 'none', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 'bold' }}>
            Go to login
          </Link>
          {session && (
            <p style={{ marginTop: 20 }}>
              <button onClick={() => supabase.auth.signOut()} style={{ background: 'none', border: 'none', color: '#555', fontSize: 13, cursor: 'pointer', textDecoration: 'underline' }}>
                Log out ({session.user.email})
              </button>
            </p>
          )}
        </div>
      </div>
    )
  }

  return children
}
