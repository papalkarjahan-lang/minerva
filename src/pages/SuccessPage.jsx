import { useSearchParams, Link } from 'react-router-dom'

export default function SuccessPage() {
  const [params] = useSearchParams()
  const businessId = params.get('business_id')

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
            to={`/dispatch/${businessId}`}
            style={{ display: 'block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '16px 0', borderRadius: 12, fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>
            Open your dispatch map →
          </Link>
        )}
        <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
          Your free trial runs for 7 days. You'll receive an email before any charge.
        </p>
      </div>
    </div>
  )
}
