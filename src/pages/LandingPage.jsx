import { Link } from 'react-router-dom'

// Business contact line for the public footer. Each part is independently
// optional (VITE_BUSINESS_ABN/EMAIL/PHONE) — only configured parts are
// shown, never a broken "[your ABN]"-style placeholder in production.
// (Fixed 2026-09-08 — this footer used to hardcode literal bracket
// placeholder text that was visible to real visitors.)
const CONTACT_PARTS = [
  import.meta.env.VITE_BUSINESS_ABN && `ABN ${import.meta.env.VITE_BUSINESS_ABN}`,
  import.meta.env.VITE_BUSINESS_EMAIL,
  import.meta.env.VITE_BUSINESS_PHONE,
].filter(Boolean)

const FAQS = [
  ['Do my technicians need to install an app?', 'No — it opens straight in their phone\'s browser from a text link. No app store, no install, no account to create.'],
  ['How long does setup actually take?', 'About 20 minutes: add your technicians, send them their link, add your first job. No hardware, no integration with anything else you use.'],
  ['What if a technician\'s phone loses signal?', 'Locations queue on the phone and send the moment it reconnects — nothing is lost, and the dispatcher view shows an "Offline" badge in the meantime.'],
  ['Can I cancel anytime?', 'Yes — self-serve from your billing settings, no call required. Your 7-day trial isn\'t charged unless you keep using it past day 7.'],
  ['Is this locked into a long contract?', 'No contract. It\'s a monthly per-technician subscription, same as any SaaS tool — cancel whenever.'],
]

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
        <p style={{ fontSize: 20, color: '#aaa', margin: '0 0 12px', lineHeight: 1.6 }}>
          Live map. Client tracking SMS. Set up in 20 minutes.
        </p>
        <p style={{ fontSize: 14, color: '#556', margin: '0 0 40px', letterSpacing: 0.5 }}>
          Built for plumbers, electricians, HVAC, locksmiths, and cleaning &amp; pest control teams — 2 to 30 technicians.
        </p>
        <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '18px 48px', borderRadius: 14, fontSize: 18, fontWeight: 'bold', marginBottom: 14 }}>
          Start your free trial →
        </Link>
        <p style={{ color: '#555', fontSize: 14, margin: 0 }}>7-day free trial. Set up on the call. First charge after day 7.</p>
      </div>

      {/* Live map illustration — a stylized representation, not a claimed screenshot.
          Swap this block for a real <img> of your dispatcher map once you have one
          (Dispatcher view → let a demo job run for a minute → screenshot the map),
          but this is safe to ship as-is: it never claims to be a real product photo. */}
      <div style={{ maxWidth: 900, margin: '0 auto 60px', padding: '0 24px' }}>
        <div style={{ background: '#0a0f1d', borderRadius: 20, border: '1px solid #1e293b', padding: '32px', position: 'relative', overflow: 'hidden' }}>
          <p style={{ color: '#2D5FA8', fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 20px' }}>Live Dispatch Map</p>
          <div style={{
            position: 'relative', height: 280, borderRadius: 14, background: '#050b16',
            backgroundImage: 'linear-gradient(#132038 1px, transparent 1px), linear-gradient(90deg, #132038 1px, transparent 1px)',
            backgroundSize: '40px 40px', border: '1px solid #16233a', overflow: 'hidden',
          }}>
            {[
              { top: '30%', left: '22%', color: '#1D9E75', label: 'Mike — 4 min away' },
              { top: '58%', left: '58%', color: '#2D5FA8', label: 'Sarah — on site' },
              { top: '72%', left: '30%', color: '#1D9E75', label: 'Jayden — en route' },
            ].map((t, i) => (
              <div key={i} style={{ position: 'absolute', top: t.top, left: t.left, transform: 'translate(-50%, -50%)' }}>
                <span style={{
                  display: 'block', width: 14, height: 14, borderRadius: '50%', background: t.color,
                  boxShadow: `0 0 0 6px ${t.color}33`,
                }} />
                <span style={{
                  position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap',
                  background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 8, padding: '4px 10px',
                  fontSize: 11, color: '#ccc',
                }}>{t.label}</span>
              </div>
            ))}
          </div>
          <p style={{ color: '#444', fontSize: 12, margin: '16px 0 0' }}>Illustrative — see it running live with your own technicians in the free trial.</p>
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

      {/* FAQ / objection handling */}
      <div style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 24px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 'bold', margin: '0 0 24px', textAlign: 'center' }}>Common questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {FAQS.map(([q, a]) => (
            <div key={q} style={{ background: '#0a0f1d', borderRadius: 14, padding: '18px 22px', border: '1px solid #1e293b' }}>
              <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, margin: '0 0 6px' }}>{q}</p>
              <p style={{ color: '#888', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <div style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 'bold', margin: '0 0 12px' }}>Simple, honest pricing</h2>
        <p style={{ color: '#aaa', margin: '0 0 36px' }}>Per technician. Cancel anytime.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {[
            ['Starter', '$49', 'per tech/month', ['Live GPS map', 'Client ETA SMS', 'Job start/complete', 'Dispatch board & job scheduling', 'Automatic intake chat & lead scoring', 'Works on any phone']],
            ['Standard', '$79', 'per tech/month', ['Everything in Starter', 'Recommended for growing teams'], true],
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
        <p style={{ margin: '0 0 10px' }}>
          Minerva | An Antikythera / Krios AI product{CONTACT_PARTS.length > 0 ? ` | ${CONTACT_PARTS.join(' | ')}` : ''}
        </p>
        <p style={{ margin: 0 }}>
          <Link to="/terms" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Terms of Service</Link>
          <Link to="/privacy" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Privacy Policy</Link>
          <Link to="/refund-policy" style={{ color: '#666', textDecoration: 'none', margin: '0 10px' }}>Refund Policy</Link>
        </p>
      </footer>
    </div>
  )
}
