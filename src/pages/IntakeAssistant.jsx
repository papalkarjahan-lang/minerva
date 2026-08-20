import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function IntakeAssistant() {
  const { businessId } = useParams()
  const [business, setBusiness] = useState(null)
  const [error, setError] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [leadCaptured, setLeadCaptured] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => { loadBusiness() }, [businessId])

  async function loadBusiness() {
    const { data, error: bizErr } = await supabase
      .from('businesses').select('id, name, trade_type, city').eq('id', businessId).single()
    if (bizErr || !data) { setError('This chat link is invalid.'); return }
    setBusiness(data)
    setMessages([{ role: 'assistant', content: `Hi, thanks for reaching out to ${data.name}! What's going on — tell me a bit about the job.` }])
  }

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending || leadCaptured) return
    const nextMessages = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    try {
      const response = await supabase.functions.invoke('ai-intake-chat', {
        body: { businessId, messages: nextMessages }
      })
      if (response.error) throw new Error(response.error.message)
      const { reply, leadCaptured: captured } = response.data
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
      if (captured) setLeadCaptured(true)
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, something went wrong on our end — please try again in a moment." }])
      console.error(err)
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}><p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p></div>
    </div>
  )

  if (!business) return (
    <div style={styles.screen}><p style={{ color: '#888', fontSize: 16 }}>Loading...</p></div>
  )

  return (
    <div style={styles.screen}>
      <div style={styles.widget}>
        <div style={styles.header}>
          <p style={styles.bizName}>{business.name}</p>
          <p style={styles.heading}>Chat with us</p>
        </div>

        <div style={styles.messageList}>
          {messages.map((m, i) => (
            <div key={i} style={{ ...styles.bubbleRow, justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>{m.content}</div>
            </div>
          ))}
          {sending && (
            <div style={styles.bubbleRow}>
              <div style={styles.assistantBubble}>...</div>
            </div>
          )}
          {leadCaptured && (
            <div style={styles.leadCard}>
              <p style={{ margin: 0, color: '#1D9E75', fontWeight: 'bold', fontSize: 14 }}>✅ Got it — {business.name} will be in touch shortly.</p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div style={styles.inputRow}>
          <textarea
            style={styles.input}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={leadCaptured ? 'Conversation complete' : 'Type a message...'}
            disabled={sending || leadCaptured}
            rows={1}
          />
          <button style={styles.sendBtn} onClick={sendMessage} disabled={sending || leadCaptured || !input.trim()}>Send</button>
        </div>
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 16 },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  widget: { width: '100%', maxWidth: 420, height: '85vh', maxHeight: 640, background: '#0a0f1d', borderRadius: 16, border: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { padding: '16px 20px', borderBottom: '1px solid #1e293b' },
  bizName: { color: '#555', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  heading: { color: '#fff', fontSize: 18, fontWeight: 'bold', margin: 0 },
  messageList: { flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 },
  bubbleRow: { display: 'flex' },
  assistantBubble: { background: '#141b2e', color: '#c9d8de', borderRadius: '14px 14px 14px 4px', padding: '10px 14px', maxWidth: '80%', fontSize: 14, lineHeight: 1.5 },
  userBubble: { background: '#2D5FA8', color: '#fff', borderRadius: '14px 14px 4px 14px', padding: '10px 14px', maxWidth: '80%', fontSize: 14, lineHeight: 1.5 },
  leadCard: { background: '#1D9E7522', border: '1px solid #1D9E75', borderRadius: 12, padding: 12, textAlign: 'center' },
  inputRow: { display: 'flex', gap: 8, padding: 12, borderTop: '1px solid #1e293b' },
  input: { flex: 1, background: '#141b2e', border: '1px solid #1e293b', borderRadius: 10, color: '#fff', padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', resize: 'none' },
  sendBtn: { background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' },
}
