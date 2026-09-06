import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { classifyPriority } from '../utils'

// Shared "Contact support" form — writes to support_requests
// (supabase_schema_delta_support_requests.sql), read by the internal
// /admin console (AdminConsole.jsx). Used from both DispatcherView
// (business owner) and TechnicianView (crew member) with a different
// defaultName/businessId.
//
// Priority is classified client-side via classifyPriority() in utils.js
// (same "template classification, no AI needed" pattern as ai-intake-chat's
// EMERGENCY_KEYWORDS) so AdminConsole can triage urgent messages (a
// business that's down, can't get paid, or wants to cancel) ahead of
// routine ones — see supabase_schema_delta_support_priority.sql.

export default function ContactSupportModal({ businessId, defaultName = '', defaultContact = '', onClose }) {
  const [name, setName] = useState(defaultName)
  const [contact, setContact] = useState(defaultContact)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error: insertErr } = await supabase.from('support_requests').insert({
      business_id: businessId || null,
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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20 }}>
      <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 32, maxWidth: 420, width: '100%' }}>
        <h3 style={{ color: '#fff', margin: '0 0 16px' }}>Contact support</h3>
        {sent ? (
          <>
            <p style={{ color: '#8fd0e8', fontSize: 14, marginBottom: 20 }}>Sent — we'll get back to you shortly.</p>
            <button onClick={onClose} style={{ background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>Close</button>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <input placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '10px 12px', fontSize: 14, marginBottom: 10 }} />
            <input placeholder="Email or phone (so we can reply)" value={contact} onChange={e => setContact(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '10px 12px', fontSize: 14, marginBottom: 10 }} />
            <textarea required placeholder="What's up?" rows={4} value={message} onChange={e => setMessage(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '10px 12px', fontSize: 14, marginBottom: 12, fontFamily: 'inherit', resize: 'vertical' }} />
            {error && <p style={{ color: '#e07a7a', fontSize: 13, marginBottom: 12 }}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={sending} style={{ background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 20px', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1 }}>
                {sending ? 'Sending...' : 'Send'}
              </button>
              <button type="button" onClick={onClose} style={{ background: 'none', border: '1px solid #1e293b', color: '#aaa', borderRadius: 8, padding: '10px 20px', cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
