import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'

// Same 3 tiers as LandingPage.jsx's inline pricing block — kept in sync by
// hand (both are small, static arrays); if you change one, change the other.
const TIERS = [
  ['Starter', '$49', 'per tech/month', ['Live GPS map', 'Client ETA SMS', 'Job start/complete', 'Dispatch board & job scheduling', 'Automatic intake chat & lead scoring', 'Works on any phone']],
  ['Standard', '$79', 'per tech/month', ['Everything in Starter', 'Recommended for growing teams'], true],
  ['Pro', '$119', 'per tech/month', ['Everything in Standard', 'On-site invoicing', 'Asset tracking', 'Compliance & onboarding checklists', 'Materials & inventory tracking', 'Technician credential tracking', 'Automated growth marketing suggestions']],
]

const PRICING_FAQS = [
  ['Is this per technician or a flat fee?', 'Per technician, per month. Add or remove technicians anytime and your bill adjusts.'],
  ['Can I cancel anytime?', 'Yes — self-serve from your billing settings, no call required. Your 7-day trial isn\'t charged unless you keep using it past day 7.'],
  ['Is this locked into a long contract?', 'No contract. It\'s a monthly subscription, same as any SaaS tool — cancel whenever.'],
  ['Can I switch tiers later?', 'Yes, upgrade or downgrade anytime from billing settings.'],
]

export default function Pricing() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '70px 24px 40px' }}>
        <h1 style={{ fontSize: 42, fontWeight: 'bold', margin: '0 0 12px' }}>Simple, honest pricing</h1>
        <p style={{ fontSize: 18, color: '#aaa', margin: 0 }}>Per technician. Cancel anytime. No setup fees.</p>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto 60px', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
          {TIERS.map(([name, price, period, features, highlight]) => (
            <div key={name} style={{ background: highlight ? '#2D5FA8' : '#0a0f1d', borderRadius: 16, padding: 24, border: `1px solid ${highlight ? '#2D5FA8' : '#1e293b'}` }}>
              <p style={{ color: highlight ? '#fff' : '#888', fontSize: 13, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: 1 }}>{name}</p>
              <p style={{ color: '#fff', fontSize: 32, fontWeight: 'bold', margin: '0 0 2px' }}>{price}</p>
              <p style={{ color: highlight ? '#b8d4ff' : '#555', fontSize: 12, margin: '0 0 20px' }}>{period}</p>
              {features.map(f => <p key={f} style={{ color: highlight ? '#dde8ff' : '#666', fontSize: 13, margin: '0 0 8px', textAlign: 'left' }}>✓ {f}</p>)}
              <Link to="/start" style={{ display: 'block', textAlign: 'center', background: highlight ? '#fff' : '#1D9E75', color: highlight ? '#2D5FA8' : '#fff', textDecoration: 'none', padding: '12px 0', borderRadius: 10, fontSize: 14, fontWeight: 'bold', marginTop: 16 }}>
                Start free trial
              </Link>
            </div>
          ))}
        </div>
        <p style={{ color: '#555', fontSize: 13, textAlign: 'center', margin: '24px 0 0' }}>7-day free trial on any tier. First charge after day 7.</p>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 24px' }}>
        <h2 style={{ fontSize: 24, fontWeight: 'bold', margin: '0 0 20px', textAlign: 'center' }}>Pricing questions</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {PRICING_FAQS.map(([q, a]) => (
            <div key={q} style={{ background: '#0a0f1d', borderRadius: 14, padding: '18px 22px', border: '1px solid #1e293b' }}>
              <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, margin: '0 0 6px' }}>{q}</p>
              <p style={{ color: '#888', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
