import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function SuccessPage() {
  const [params] = useSearchParams()
  const businessId = params.get('business_id')
  const [copied, setCopied] = useState(false)
  const [sector, setSector] = useState('trade')

  useEffect(() => {
    if (!businessId) return
    supabase.from('businesses').select('sector').eq('id', businessId).single()
      .then(({ data }) => { if (data?.sector) setSector(data.sector) })
  }, [businessId])

  const intakeUrl = businessId ? `${window.location.origin}/intake/${businessId}` : ''
  const consoleUrl = businessId ? (sector === 'industrial' ? `/industrial/${businessId}` : `/dispatch/${businessId}`) : ''

  function copyLink() {
    navigator.clipboard.writeText(intakeUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
          Your free trial runs for 7 days. Stripe will bill your card automatically when it ends — cancel anytime before then from your billing settings.
        </p>
      </div>
    </div>
  )
}
