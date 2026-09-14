import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { classifyPriority } from '../utils'
import { SiteNav, SiteFooter } from '../components/SiteChrome'

// Public /contact page for prospects and existing customers, unauthenticated.
// Writes to support_requests using the exact same shape as
// ContactSupportModal.jsx — that table already has an anon INSERT policy
// (supabase_schema_delta_support_requests.sql, "anon insert support_requests"
// with check (true)) plus a base GRANT to anon, so this needs no new
// policy or grant. business_id is null here since the visitor isn't
// scoped to a business yet (that's the point of a marketing-site contact
// form vs. the in-app support modal).
export default function Contact() {
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error: insertErr } = await supabase.from('support_requests').insert({
      business_id: null,
      from_name: name.trim() || null,
      from_contact: contact.trim() || null,
      message: message.trim(),
      priority: classifyPriority(message),
    })
    setSending(false)
    if (insertErr) { setError(insertErr.message); return }
    setSent(true)
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '70px 24px 80px' }}>
        <h1 style={{ fontSize: 36, fontWeight: 'bold', margin: '0 0 12px', textAlign: 'center' }}>Get in touch</h1>
        <p style={{ color: '#aaa', fontSize: 15, margin: '0 0 32px', textAlign: 'center' }}>
          Questions, a demo request, or just want to talk it through — send a message.
        </p>

        {sent ? (
          <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#1D9E75', fontSize: 16, margin: 0 }}>Sent — we'll get back to you shortly.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 28 }}>
            <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <input placeholder="Email or phone (so we can reply)" value={contact} onChange={e => setContact(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <textarea required placeholder="What's up?" rows={5} value={message} onChange={e => setMessage(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 14, fontFamily: 'inherit', resize: 'vertical' }} />
            {error && <p style={{ color: '#e07a7a', fontSize: 13, marginBottom: 14 }}>{error}</p>}
            <button type="submit" disabled={sending} style={{ width: '100%', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15, fontWeight: 'bold', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1 }}>
              {sending ? 'Sending...' : 'Send message'}
            </button>
          </form>
        )}
      </div>

      <SiteFooter />
    </div>
  )
}
