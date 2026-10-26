import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useDocumentMeta } from '../hooks/useDocumentMeta'

// Same allowlist AdminConsole.jsx checks — duplicated rather than imported,
// same small-cross-file-duplication tradeoff this codebase already accepts
// for AdminConsole's own TIER_PRICES copy. Only used here to decide where
// to send someone who's already signed in and has nowhere else to go (see
// the "no redirect and no admin match" case below).
const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || '')
  .split(',').map(e => e.trim().toLowerCase()).filter(Boolean)

// Business owner login — Supabase Auth magic link (signInWithOtp), no
// password to manage or leak. Requires no new external service (unlike the
// send-email function, this rides on Supabase's own built-in auth email
// delivery), so it works the moment Supabase Auth's email provider is on
// (the default). See supabase_schema_delta_owner_auth.sql and
// RequireBusinessAuth.jsx for the rest of this auth gate.
//
// Found 2026-10-27: this page never checked whether the visitor already
// had a session — including right after actually completing the magic-
// link flow, since emailRedirectTo always points back here. A real user
// who clicked their login link landed on the exact same "enter your
// email" form with zero indication anything had happened, even though
// Supabase's client SDK had already parsed the URL and established the
// session client-side. Same root gap affected every business owner, not
// just the admin console: RequireBusinessAuth.jsx's "Go to login" link
// carried no way back to the dispatch console that redirected them here
// in the first place. Fixed both ends: RequireBusinessAuth now links here
// with `?redirect=<path it came from>`, carried through the magic link
// itself, and this page now actively checks for a session on mount and on
// every auth-state change, redirecting immediately once one exists —
// to `redirect` if present, to `/admin` if the signed-in email is on the
// admin allowlist, or a plain "you're signed in" state with a log-out
// escape hatch if neither applies (this page has no other destination to
// guess at).
export default function Login() {
  useDocumentMeta({ title: 'Log in' })
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [session, setSession] = useState(null)
  const [checkingSession, setCheckingSession] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function check() {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      if (cancelled) return
      setCheckingSession(false)
      if (!currentSession) { setSession(null); return }
      setSession(currentSession)
      // A safe relative path only — never follow a redirect value that
      // could point off-site (an open-redirect risk if this param were
      // ever attacker-supplied, e.g. a crafted login link sent to someone).
      if (redirect && redirect.startsWith('/') && !redirect.startsWith('//')) {
        navigate(redirect, { replace: true })
        return
      }
      if (ADMIN_EMAILS.includes((currentSession.user.email || '').toLowerCase())) {
        navigate('/admin', { replace: true })
      }
    }
    check()
    const { data: listener } = supabase.auth.onAuthStateChange(() => check())
    return () => { cancelled = true; listener?.subscription?.unsubscribe() }
  }, [redirect, navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError(null)
    const redirectTo = window.location.origin + '/login' + (redirect ? `?redirect=${encodeURIComponent(redirect)}` : '')
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    })
    setLoading(false)
    if (otpErr) { setError(otpErr.message); return }
    setSent(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <div style={{ background: '#0a0f1d', borderRadius: 20, padding: 48, maxWidth: 420, width: '100%', textAlign: 'center', border: '1px solid #1e293b' }}>
        <span style={{ fontSize: 20, fontWeight: 'bold', color: '#fff', letterSpacing: 3 }}>MINERVA</span>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 'bold', margin: '24px 0 12px' }}>Business owner login</h1>
        {checkingSession ? (
          <p style={{ color: '#888', fontSize: 14 }}>Checking...</p>
        ) : session ? (
          // Reached only when a session exists but neither a `redirect`
          // param nor the admin allowlist gave us anywhere to send it —
          // this page genuinely doesn't know which business's dispatch
          // console to point at, so say so plainly instead of guessing.
          <>
            <p style={{ color: '#8fd0e8', fontSize: 15, lineHeight: 1.6, margin: '0 0 20px' }}>
              You're signed in as <strong>{session.user.email}</strong>. Open your business's dispatch link to continue — this page doesn't have one to send you to on its own.
            </p>
            <button
              onClick={() => supabase.auth.signOut()}
              style={{ background: 'none', border: '1px solid #1e293b', color: '#aaa', fontSize: 13, padding: '10px 20px', borderRadius: 10, cursor: 'pointer' }}
            >
              Log out
            </button>
          </>
        ) : sent ? (
          <p style={{ color: '#8fd0e8', fontSize: 15, lineHeight: 1.6 }}>
            Check your inbox — we've sent a login link to <strong>{email}</strong>. Open it on this device to sign in.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
              Enter the email you signed up with. We'll send you a one-time login link — no password needed.
            </p>
            <input
              type="email"
              required
              aria-label="Email address"
              placeholder="you@business.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 10, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 16 }}
            />
            {error && <p style={{ color: '#e07a7a', fontSize: 13, margin: '0 0 16px' }}>{error}</p>}
            <button
              type="submit"
              disabled={loading}
              style={{ width: '100%', background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15, fontWeight: 'bold', cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.6 : 1 }}
            >
              {loading ? 'Sending...' : 'Send login link'}
            </button>
          </form>
        )}
        <p style={{ marginTop: 24 }}>
          <Link to="/" style={{ color: '#888', fontSize: 13, textDecoration: 'none' }}>← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
