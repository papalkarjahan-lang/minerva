import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { Reveal } from '../hooks/useReveal'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
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
// checked against supabase_schema_delta_industrial.sql and
// IndustrialDispatcherView (the console every page on this page's own
// signup path actually lands an industrial-sector business in), not
// invented for this page.
//
// A 6th bullet — "Custom automation workflows... webhook/Slack workflows
// off lead, job, or invoice events" — was removed 2026-10-08. That
// feature (custom_workflows, run-custom-workflows) is real, but every
// call site and every bit of UI to configure it lives exclusively in
// DispatcherView.jsx (the TRADE console) — IndustrialDispatcherView.jsx
// has no equivalent, and industrial's own lead/job pipeline never fires
// any of the 3 named trigger events. An industrial-sector prospect
// reading this page — the exact audience it's written for — could never
// actually reach the feature it promised. See
// BILLING_INTEGRITY_NOTES.md's "Enterprise.jsx's custom-workflows claim"
// entry. The 5 bullets below were individually re-verified against their
// real backend at the same time and are genuinely industrial-correct.
const CAPABILITIES = [
  ['🛰️', 'Asset telemetry & geofencing', 'Track engine hours, maintenance intervals, and geofenced site zones for every piece of equipment, not just people.'],
  ['📍', 'Multi-day site tracking', 'Sites get their own scope of work and arrival/departure check-ins, for jobs that run over multiple days.'],
  ['⚠️', 'Safety incident tracking', 'Log and acknowledge on-site safety incidents, by severity, in one place.'],
  ['📦', 'Consumables reorder alerts', 'Get flagged before on-site stock runs out, not after.'],
  ['📑', 'Client verification packages', 'Assemble evidence packages (photos, checklists, sign-off) for client and compliance handoff.'],
]

export default function Enterprise() {
  useDocumentMeta({ title: 'Enterprise', description: 'Multi-van fleets, facilities management, councils, and strata — asset tracking, site check-ins, and safety compliance built on Minerva.' })
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
    // Same double-submit-race guard as Contact.jsx — a double-click or
    // double-Enter before the disabled attribute re-renders would
    // otherwise insert a duplicate big_account_targets row into the
    // sales pipeline.
    if (sending) return
    setSending(true)
    setError(null)
    // id generated client-side (crypto.randomUUID(), same approach already
    // used for businesses.ingestion_key) rather than via .select() on the
    // insert — this table's SELECT policy is admin-only (see
    // supabase_schema_delta_enterprise_inbound.sql), and Postgres RLS
    // filters INSERT...RETURNING through SELECT policies too, so an
    // anon .select().single() here would throw even though the insert
    // itself succeeded — turning a genuine submission into a false error
    // for the visitor. Generating the id ourselves needs no read-back at all.
    const newId = crypto.randomUUID()
    const { error: insertErr } = await supabase.from('big_account_targets').insert({
      id: newId,
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
    // Best-effort operator alert — never blocks this submission from
    // succeeding (setSent(true) above already happened). See
    // notify-new-enterprise-lead's header comment: it re-reads this exact
    // row server-side rather than trusting anything from this call.
    supabase.functions.invoke('notify-new-enterprise-lead', { body: { targetId: newId } }).catch(() => {})
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
          <div role="status" style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 32, textAlign: 'center' }}>
            <p style={{ color: '#1D9E75', fontSize: 16, margin: 0 }}>Thanks — we'll be in touch.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 28 }}>
            <input aria-label="Company name" required placeholder="Company name" value={companyName} onChange={e => setCompanyName(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <select aria-label="Company type" value={companyType} onChange={e => setCompanyType(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }}>
              {COMPANY_TYPES.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
            </select>
            <input aria-label="Your name" placeholder="Your name" value={contactName} onChange={e => setContactName(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <input aria-label="Email" placeholder="Email" type="email" value={contactEmail} onChange={e => setContactEmail(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            <input aria-label="Phone (optional)" placeholder="Phone (optional)" value={contactPhone} onChange={e => setContactPhone(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 12 }} />
            {/* minWidth: 0 on both — found live at 375px: a flex item
                defaults to min-width:auto, and <input> has its own
                non-zero intrinsic min width in the browser's own default
                form-control sizing, so flex:1 alone doesn't let either
                input shrink to its fair share of the row. Without this,
                the pair overflowed the viewport by 39px. */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <input aria-label="Fleet size (number of technicians)" placeholder="Fleet size (# technicians)" type="number" min="1" value={fleetSize} onChange={e => setFleetSize(e.target.value)} className="lp-input"
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14 }} />
              <input aria-label="Region" placeholder="Region" value={region} onChange={e => setRegion(e.target.value)} className="lp-input"
                style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14 }} />
            </div>
            <textarea aria-label="Anything else we should know? (optional)" placeholder="Anything else we should know? (optional)" rows={3} value={notes} onChange={e => setNotes(e.target.value)} className="lp-input"
              style={{ width: '100%', boxSizing: 'border-box', background: '#050811', border: '1px solid #1e293b', borderRadius: 8, color: '#fff', padding: '12px 14px', fontSize: 14, marginBottom: 14, fontFamily: 'inherit', resize: 'vertical' }} />
            {error && <p role="alert" style={{ color: '#e07a7a', fontSize: 13, marginBottom: 14 }}>{error}</p>}
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
