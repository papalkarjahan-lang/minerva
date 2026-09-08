import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function SuccessPage() {
  const [params] = useSearchParams()
  const businessId = params.get('business_id')
  const [copied, setCopied] = useState(false)
  const [snippetCopied, setSnippetCopied] = useState(false)
  const [sector, setSector] = useState('trade')

  useEffect(() => {
    if (!businessId) return
    // Retries once on failure before giving up (rather than silently
    // leaving sector at its 'trade' default forever) — an industrial
    // business landing here right after a Stripe redirect, hitting a
    // transient fetch error, would otherwise get sent to the wrong
    // console with no indication anything went wrong. (Fixed 2026-09-07.)
    let cancelled = false
    async function loadSector() {
      for (let attempt = 0; attempt < 2; attempt++) {
        const { data, error } = await supabase.from('businesses').select('sector').eq('id', businessId).single()
        if (cancelled) return
        if (!error && data?.sector) { setSector(data.sector); return }
        if (attempt === 0) await new Promise(r => setTimeout(r, 800))
      }
    }
    loadSector()
    return () => { cancelled = true }
  }, [businessId])

  const intakeUrl = businessId ? `${window.location.origin}/intake/${businessId}` : ''
  const embedSnippet = businessId
    ? `<script src="${window.location.origin}/widget.js" data-business-id="${businessId}" async></script>`
    : ''
  const consoleUrl = businessId ? (sector === 'industrial' ? `/industrial/${businessId}` : `/dispatch/${businessId}`) : ''

  function copyLink() {
    navigator.clipboard.writeText(intakeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function copySnippet() {
    navigator.clipboard.writeText(embedSnippet)
    setSnippetCopied(true)
    setTimeout(() => setSnippetCopied(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 }}>
      <div style={{ background: '#0a0f1d', borderRadius: 20, padding: 48, maxWidth: 480, width: '100%', textAlign: 'center', border: '1px solid #1e293b' }}>
        <p style={{ fontSize: 48, margin: '0 0 16px' }}>✅</p>
        <h1 style={{ color: '#fff', fontSize: 28, fontWeight: 'bold', margin: '0 0 12px' }}>You're live on Minerva</h1>
        <p style={{ color: '#aaa', fontSize: 16, margin: '0 0 32px', lineHeight: 1.6 }}>
          Your technicians have been sent their setup links. They open the link, tap "Start Tracking," and they appear on your map.
        </p>
        {businessId && (
          <Link
            to={consoleUrl}
            style={{ display: 'block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '16px 0', borderRadius: 12, fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>
            {sector === 'industrial' ? 'Open your operations console →' : 'Open your dispatch map →'}
          </Link>
        )}
        {businessId && (
          <div style={{ background: '#050811', border: '1px solid #1e293b', borderRadius: 12, padding: 18, textAlign: 'left', marginBottom: 16 }}>
            <p style={{ color: '#8fd0e8', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 8px' }}>Your intake chat link</p>
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
              Add this to your website's "Contact Us" button, your Google Business profile, or your SMS auto-replies. Visitors chat through a guided intake flow that triages the job and texts you the qualified leads.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={intakeUrl} onClick={e => e.target.select()}
                style={{ flex: 1, background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 8, color: '#c9d8de', padding: '8px 10px', fontSize: 12, fontFamily: 'monospace' }} />
              <button onClick={copyLink} style={{ background: copied ? '#1D9E75' : '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {copied ? 'Copied!' : 'Copy link'}
              </button>
            </div>
          </div>
        )}
        {businessId && (
          <div style={{ background: '#050811', border: '1px solid #1e293b', borderRadius: 12, padding: 18, textAlign: 'left', marginBottom: 16 }}>
            <p style={{ color: '#8fd0e8', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 8px' }}>Embed on your own website</p>
            <p style={{ color: '#888', fontSize: 13, margin: '0 0 12px', lineHeight: 1.5 }}>
              Prefer a chat bubble on your own site instead of a link? Paste this one line before your site's closing &lt;/body&gt; tag (works on Wix, Squarespace, WordPress, or any custom site that lets you add HTML/embed code).
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={embedSnippet} onClick={e => e.target.select()}
                style={{ flex: 1, background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 8, color: '#c9d8de', padding: '8px 10px', fontSize: 11, fontFamily: 'monospace' }} />
              <button onClick={copySnippet} style={{ background: snippetCopied ? '#1D9E75' : '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {snippetCopied ? 'Copied!' : 'Copy code'}
              </button>
            </div>
          </div>
        )}
        {businessId && (
          <div style={{ background: '#050811', border: '1px solid #1e293b', borderRadius: 12, padding: 18, textAlign: 'left', marginBottom: 16 }}>
            <p style={{ color: '#8fd0e8', fontSize: 12, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 8px' }}>A few things worth knowing</p>
            <ul style={{ color: '#888', fontSize: 13, margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
              <li>Missed-call auto-text-back only fires for calls to a Minerva-managed number — to use your existing business number, ask your carrier to forward it "on no answer" to the number in your Twilio setup, rather than replacing it.</li>
              <li>Technician tracking runs in the browser, not a native app — ask techs to keep the tracking page open and their screen on; locking the phone pauses GPS updates.</li>
              <li>Xero sync (Pro/Max add-on) is a one-click "Connect Xero" in Settings — no setup on your end beyond logging into your own Xero account.</li>
              <li>Minerva generates and syncs invoices but doesn't take payment itself — you still collect payment the way you do today.</li>
            </ul>
          </div>
        )}
        <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
          Your free trial runs for 7 days. Stripe will bill your card automatically when it ends — cancel anytime before then from your billing settings.
        </p>
      </div>
    </div>
  )
}
