import { useState } from 'react'
import { supabase } from '../supabaseClient'

// Small floating Q&A chat widget for an EXISTING client with a job or
// invoice link — calls client-support-chat, which only ever knows about
// that one job/invoice (see its own header comment). Pass exactly one of
// jobId or invoiceId. Purely additive, opt-in (collapsed by default) —
// doesn't change anything about the page it's embedded in.
export default function ClientSupportChat({ jobId, invoiceId, businessName }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    const text = input.trim()
    if (!text || sending) return
    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    const { data, error } = await supabase.functions.invoke('client-support-chat', {
      body: { jobId, invoiceId, messages: nextMessages },
    })
    setSending(false)
    if (error || data?.error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I couldn't get an answer just then — please try again." }])
      return
    }
    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
  }

  if (!open) {
    return (
      <button style={styles.launcher} onClick={() => setOpen(true)}>
        💬 Questions? Ask {businessName || 'us'}
      </button>
    )
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.headerText}>Ask {businessName || 'a question'}</span>
        <button style={styles.closeBtn} onClick={() => setOpen(false)}>✕</button>
      </div>
      <div style={styles.messages}>
        {messages.length === 0 && (
          <p style={styles.placeholder}>Ask about your job status, arrival time, or invoice.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>{m.content}</div>
        ))}
        {sending && <div style={styles.assistantBubble}>...</div>}
      </div>
      <div style={styles.inputRow}>
        <input
          style={styles.input}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && send()}
          placeholder="Type a question..."
        />
        <button style={styles.sendBtn} onClick={send} disabled={sending}>Send</button>
      </div>
    </div>
  )
}

const styles = {
  launcher: { position: 'fixed', bottom: 20, right: 20, background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 24, padding: '10px 16px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,0.4)', zIndex: 50 },
  panel: { position: 'fixed', bottom: 20, right: 20, width: 300, maxWidth: 'calc(100vw - 40px)', background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 14, display: 'flex', flexDirection: 'column', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 50, maxHeight: 400 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid #1e293b' },
  headerText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  closeBtn: { background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: 13 },
  messages: { flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 6, minHeight: 120 },
  placeholder: { color: '#555', fontSize: 12, margin: 0 },
  userBubble: { alignSelf: 'flex-end', background: '#2D5FA8', color: '#fff', borderRadius: 10, padding: '6px 10px', fontSize: 13, maxWidth: '85%' },
  assistantBubble: { alignSelf: 'flex-start', background: '#1e293b', color: '#ccc', borderRadius: 10, padding: '6px 10px', fontSize: 13, maxWidth: '85%' },
  inputRow: { display: 'flex', gap: 6, padding: 10, borderTop: '1px solid #1e293b' },
  input: { flex: 1, background: '#0f1420', color: '#ccc', border: '1px solid #1e293b', borderRadius: 8, padding: '7px 10px', fontSize: 13 },
  sendBtn: { background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer' },
}
