import { Link } from 'react-router-dom'

export default function LandingPage() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      {/* Nav */}
      <nav style={{ padding: '20px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1e293b' }}>
        <span style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', letterSpacing: 3 }}>MINERVA</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <Link to="/login" style={{ color: '#aaa', textDecoration: 'none', fontSize: 14 }}>Log in</Link>
          <Link to="/start" style={{ background: '#2D5FA8', color: '#fff', textDecoration: 'none', padding: '10px 22px', borderRadius: 10, fontSize: 14, fontWeight: 'bold' }}>
            Start free trial
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '80px 24px 60px' }}>
        <h1 style={{ fontSize: 48, fontWeight: 'bold', lineHeight: 1.2, margin: '0 0 20px', color: '#fff' }}>
          Know where every technician is.<br />
          <span style={{ color: '#1D9E75' }}>Right now.</span>
        </h1>
        <p style={{ fontSize: 20, color: '#aaa', margin: '0 0 40px', lineHeight: 1.6 }}>
          Live map. Client tracking SMS. Set up in 20 minutes.
        </p>
        <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '18px 48px', borderRadius: 14, fontSize: 18, fontWeight: 'bold', marginBottom: 14 }}>
          Start your free trial →
        </Link>
        <p style={{ color: '#555', fontSize: 14, margin: 0 }}>7-day free trial. Set up on the call. First charge after day 7.</p>
      </div>

      {/* Screenshot placeholder */}
      <div style={{ maxWidth: 900, margin: '0 auto 60px', padding: '0 24px' }}>
        <div style={{ background: '#0a0f1d', borderRadius: 20, border: '1px solid #1e293b', padding: '40px 24px', textAlign: 'center' }}>
          <p style={{ color: '#2D5FA8', fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 12px' }}>Live Dispatch Map</p>
          <p style={{ color: '#555', fontSize: 16 }}>[ Your dispatcher map screenshot goes here ]</p>
          <p style={{ color: '#333', fontSize: 13 }}>Take a screenshot of your demo account with technician dots moving on the map</p>
        </div>
      </div>

      {/* Features */}
      <div style={{ maxWidth: 800, margin: '0 auto 80px', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        {[
          ['📍', 'Live map', 'See every technician in real time without making a single call.'],
          ['📱', 'Client SMS', 'Automatic text with a live tracking link once your tech is close by (within ~2km).'],
          ['💬', 'Automatic lead intake', 'A chat widget for your website that triages enquiries and texts you qualified leads, scored by urgency.'],
        ].map(([icon, title, desc]) => (
          <div key={title} style={{ background: '#0a0f1d', borderRadius: 16, padding: 24, border: '1px solid #1e293b' }}>
            <p style={{ fontSize: 28, margin: '0 0 12px' }}>{icon}</p>
            <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, margin: '0 0 8px' }}>{title}</p>
            <p style={{ color: '#666', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{desc}</p>
          </div>
        ))}
      </div>

      {/* Pricing */}
      <div style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 'bold', margin: '0 0 12px' }}>Simple, honest pricing</h2>
        <p style={{ color: '#aaa', margin: '0 0 36px' }}>Per technician. Cancel anytime.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            ['Starter', '$49', 'per tech/month', ['Live GPS map', 'Client ETA SMS', 'Job start/complete', 'Works on any phone']],
            ['Standard', '$79', 'per tech/month', ['Everything in Starter', 'Dispatch board', 'Automatic intake chat & lead scoring', 'Job scheduling'], true],
            ['Pro', '$119', 'per tech/month', ['Everything in Standard', 'On-site invoicing', 'Asset tracking', 'Compliance checklists']],
          ].map(([name, price, period, features, highlight]) => (
            <div key={name} style={{ background: highlight ? '#2D5FA8' : '#0a0f1d', borderRadius: 16, padding: 24, border: `1px solid ${highlight ? '#2D5FA8' : '#1e293b'}` }}>
              <p style={{ color: highlight ? '#fff' : '#888', fontSize: 13, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>{name}</p>
              <p style={{ color: '#fff', fontSize: 32, fontWeight: 'bold', margin: '0 0 2px' }}>{price}</p>
              <p style={{ color: highlight ? '#b8d4ff' : '#555', fontSize: 12, margin: '0 0 20px' }}>{period}</p>
              {features.map(f => <p key={f} style={{ color: highlight ? '#dde8ff' : '#666', fontSize: 13, margin: '0 0 8px', textAlign: 'left' }}>✓ {f}</p>)}
            </div>
          ))}
        </div>
        <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '16px 44px', borderRadius: 12, fontSize: 16, fontWeight: 'bold', marginTop: 32 }}>
          Start your free trial
        </Link>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #1e293b', padding: '24px 40px', textAlign: 'center', color: '#444', fontSize: 13 }}>
        <p style={{ margin: '0 0 10px' }}>Minerva | An Antikythera / Krios AI product | ABN [your ABN] | [your email] | [your phone]</p>
        <p style={{ margin: 0 }}>
          <Link to="/terms" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Terms of Service</Link>
          <Link to="/privacy" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Privacy Policy</Link>
          <Link to="/refund-policy" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Refund Policy</Link>
        </p>
      </footer>
    </div>
  )
}
