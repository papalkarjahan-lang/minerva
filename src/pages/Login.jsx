import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Business owner login — Supabase Auth magic link (signInWithOtp), no
// password to manage or leak. Requires no new external service (unlike the
// send-email function, this rides on Supabase's own built-in auth email
// delivery), so it works the moment Supabase Auth's email provider is on
// (the default). See supabase_schema_delta_owner_auth.sql and
// RequireBusinessAuth.jsx for the rest of this auth gate.
export default function Login() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: otpErr } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + '/login' },
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
        {sent ? (
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
          <Link to="/" style={{ color: '#555', fontSize: 13, textDecoration: 'none' }}>← Back to home</Link>
        </p>
      </div>
    </div>
  )
}
