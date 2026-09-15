import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { Reveal } from '../hooks/useReveal'
import { cardMove, cardLeave } from '../utils/interactions'
import '../styles/interactive.css'

// Public inbound lead capture for multi-van fleets, facilities-management
// companies, councils, and strata managers — writes directly into
// big_account_targets (Minerva's own enterprise CRM, previously operator-
// entered only, see AdminConsole.jsx "Big Accounts" tab). This is a NEW
// anon-insert path (supabase_schema_delta_enterprise_inbound.sql) scoped
// narrowly: stage is forced to 'researching' and next_action/
// next_action_date are blocked at the database level, so a public
// submission can create a new row but can never fast-forward the pipeline
// or write fake internal notes. No auto-reply, no automated proposal —
// a real person on the Minerva side reviews and follows up by hand, same
// as every other target in that pipeline. Never claim a response-time SLA
// here since none is enforced anywhere in code.
const COMPANY_TYPES = [
  ['multi_van', 'Multi-van trade company'],
  ['facilities_management', 'Facilities management'],
  ['council', 'Council / local government'],
  ['strata', 'Strata / property management'],
  ['other', 'Other'],
]

// Real, shipped capabilities that specifically differentiate multi-site /
// industrial-sector operations from the standard trade tiers — cross-
// checked against supabase_schema_delta_industrial.sql and DispatcherView/
// IndustrialDispatcherView, not invented for this page.
const CAPABILITIES = [
  ['🛰️', 'Asset telemetry & geofencing', 'Track engine hours, maintenance intervals, and geofenced site zones for every piece of equipment, not just people.'],
  ['📍', 'Multi-day site tracking', 'Sites get their own scope of work and arrival/departure check-ins, for jobs that run over multiple days.'],
  ['⚠️', 'Safety incident tracking', 'Log and acknowledge on-site safety incidents, by severity, in one place.'],
  ['📦', 'Consumables reorder alerts', 'Get flagged before on-site stock runs out, not after.'],
  ['📑', 'Client verification packages', 'Assemble evidence packages (photos, checklists, sign-off) for client and compliance handoff.'],
  ['⚙️', 'Custom automation workflows', 'Trigger your own webhook/Slack workflows off lead, job, or invoice events.'],
]

export default function Enterprise() {
  const [companyName, setCompanyName] = useState('')
  const [companyType, setCompanyType] = useState('multi_van')
  const [contactName, setContactName] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [fleetSize, setFleetSize] = useState('')
  const [region, setRegion] = useState('')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError(null)
    const { error: insertErr } = await supabase.from('big_account_targets').insert({
      company_name: companyName.trim(),
      company_type: companyType,
      contact_name: contactName.trim() || null,
      contact_email: contactEmail.trim() || null,
      contact_phone: contactPhone.trim() || null,
      estimated_fleet_size: fleetSize ? parseInt(fleetSize, 10) : null,
      region: region.trim() || null,
      notes: notes.trim() || null,
    })
    setSending(false)
    if (insertErr) { setError(insertErr.message); return }
    setSent(true)
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <Reveal style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '70px 24px 40px' }}>
        <p style={{ color: '#2D5FA8', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 16px' }}>Enterprise & Multi-Site</p>
        <h1 style={{ fontSize: 42, fontWeight: 'bold', lineHeight: 1.2, margin: '0 0 16px' }}>Built for fleets, not just one van.</h1>
        <p style={{ fontSize: 18, color: '#aaa', margin: 0, lineHeight: 1.6 }}>
          For multi-van trade companies, facilities-management firms, councils, and strata portfolios —
          same per-technician pricing as every tier, with the operations layer scaled to match.
        </p>
      </Reveal>

      <div style={{ maxWidth: 900, margin: '0 auto 60px', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
        {CAPABILITIES.map(([icon, title, desc], i) => (
          <Reveal key={title} style={{ transitionDelay: `${i * 70}ms` }}>
            <div className="lp-card" onMouseMove={cardMove} onMouseLeave={cardLeave}>
              <p style={{ fontSize: 26, margin: '0 0 10px' }}>{icon}</p>
              <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, margin: '0 0 8px' }}>{title}</p>
              <p style={{ color: '#666', fontSize: 13, margin: 0, lineHeight: 1.6 }}>{desc}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <Reveal style={{ maxWidth: 480, margin: '0 auto', padding: '0 24px 80px' }}>
        <h2 style={{ fontSize: 26, fontWeight: 'bold', margin: '0 0 8px', textAlign: 'center' }}>Talk to our team</h2>
        <p style={{ color: '#aaa', fontSize: 14, margin: '0 0 28px', textAlign: 'center' }}>
          Tell us about your fleet — a real person reviews every submission, no auto-replies.
        </p>

        {sent ? (
          <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#1D9E75', fontSize: 16, margin: 0 }}>Thanks — we'll be in touch.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 28 }}>
            <input required placeholder="Company name" value={companyName} onChange={e => setCompanyName(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <select value={companyType} onChange={e => setCompanyType(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }}>
              {COMPANY_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <input placeholder="Your name" value={contactName} onChange={e => setContactName(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <input placeholder="Email" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <input placeholder="Phone (optional)" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <input placeholder="Fleet size (# technicians)" type="number" min="1" value={fleetSize} onChange={e => setFleetSize(e.target.value)} className="lp-input"
                style={{ flex: 1, boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14 }} />
              <input placeholder="Region" value={region} onChange={e => setRegion(e.target.value)} className="lp-input"
                style={{ flex: 1, boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14 }} />
            </div>
            <textarea placeholder="Anything else we should know? (optional)" rows={3} value={notes} onChange={e => setNotes(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 14, fontFamily: 'inherit', resize: 'vertical' }} />
            {error && <p style={{ color: '#e07a7a', fontSize: 13, marginBottom: 14 }}>{error}</p>}
            <button type="submit" disabled={sending} style={{ width: '100%', background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15, fontWeight: 'bold', cursor: sending ? 'default' : 'pointer', opacity: sending ? 0.6 : 1 }}>
              {sending ? 'Sending...' : 'Talk to our team'}
            </button>
          </form>
        )}
      </Reveal>

      <SiteFooter />
    </div>
  )
}
