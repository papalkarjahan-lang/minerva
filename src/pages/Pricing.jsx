import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'

// Same 3 real Stripe-backed tiers as LandingPage.jsx's inline pricing block
// (kept in sync by hand, both are small static arrays) — Starter/Standard/
// Pro, billed per technician via Stripe quantity (create-checkout-session).
// No new tier or Stripe price was created for this page; "Solo" below is
// the same Starter tier at a technician count of 1, not a separate price.
const TIERS = [
  ['Starter', '$49', 'per tech/month', ['Live GPS map', 'Client ETA SMS', 'Job start/complete', 'Dispatch board & job scheduling', 'Automatic intake chat & lead scoring', 'Works on any phone']],
  ['Standard', '$79', 'per tech/month', ['Everything in Starter', 'Recommended for growing teams'], true],
  ['Pro', '$119', 'per tech/month', ['Everything in Standard', 'On-site invoicing', 'Asset tracking', 'Compliance & onboarding checklists', 'Materials & inventory tracking', 'Technician credential tracking', 'Automated growth marketing suggestions']],
]

// A guide mapping real business sizes onto the pricing/sector structure
// that already exists in the schema (subscription_tier + sector) — no new
// tiers or billing logic, just honest framing so the same 3 tiers + sector
// choice reads as "built for every size" instead of looking like one flat
// SMB product. Sector (trade vs industrial) is chosen at signup
// (Onboarding.jsx) and is independent of which of the 3 tiers you pick.
const SIZE_GUIDE = [
  ['Solo', '1 technician (you)', 'Starter, billed for exactly 1 tech — $49/mo total.'],
  ['Small team', '2–10 technicians', 'Starter or Standard, same per-tech price either way.'],
  ['Growing team', '10–30 technicians', 'Standard or Pro — Pro unlocks invoicing, inventory, and compliance checklists.'],
  ['Multi-site / fleet', 'Any size, asset-heavy', 'Any tier + Industrial sector at signup — asset telemetry, site check-ins, safety tracking.'],
  ['Enterprise', 'Multi-van fleets, FM companies, councils, strata', 'Talk to our team — see the Enterprise page.'],
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
        <p style={{ fontSize: 18, color: '#aaa', margin: 0 }}>Per technician. Cancel anytime. No setup fees. From a solo operator to a multi-site fleet.</p>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto 50px', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14 }}>
          {SIZE_GUIDE.map(([name, size, detail]) => (
            <div key={name} style={{ background: '#0a0f1d', borderRadius: 12, padding: '16px 18px', border: '1px solid #1e293b' }}>
              <p style={{ color: '#1D9E75', fontWeight: 'bold', fontSize: 14, margin: '0 0 4px' }}>{name}</p>
              <p style={{ color: '#888', fontSize: 12, margin: '0 0 8px' }}>{size}</p>
              <p style={{ color: '#666', fontSize: 12, margin: 0, lineHeight: 1.5 }}>{detail}</p>
            </div>
          ))}
        </div>
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

        <div style={{ marginTop: 32, background: '#0a0f1d', borderRadius: 16, padding: 24, border: '1px solid #1e293b', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, margin: '0 0 4px' }}>Enterprise — multi-van fleets, FM companies, councils, strata</p>
            <p style={{ color: '#888', fontSize: 13, margin: 0 }}>Same per-tech pricing, scaled operations. A real person reviews every enquiry.</p>
          </div>
          <Link to="/enterprise" style={{ background: '#2D5FA8', color: '#fff', textDecoration: 'none', padding: '12px 28px', borderRadius: 10, fontSize: 14, fontWeight: 'bold', whiteSpace: 'nowrap' }}>
            Talk to our team
          </Link>
        </div>
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
