import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { Reveal } from '../hooks/useReveal'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { cardMove, cardLeave, magneticMove, magneticLeave } from '../utils/interactions'
import { MAX_ADDONS } from '../maxAddons'
import '../styles/interactive.css'

// Every item below is a real, shipped capability — cross-checked against
// LandingPage.jsx's pricing tiers and features grid rather than invented
// for this page. Nothing here claims a capability that doesn't exist yet
// (no fake integrations, no "AI-powered" fluff for things that are just
// a database query). Tier/add-on placement double-checked against the
// actual server-side gate each one hits, not assumed from the section it
// felt like it belonged in (2026-10-08 — found and fixed two mismatches
// this way: review requests were sitting in this unlabeled, implied-base
// section despite actually requiring the separate paid Minerva Max
// "Review Request Loop" add-on — see review_loop in src/maxAddons.js and
// send-review-request-sms's isAddonActive check — and referral nudges
// were sitting in the Pro-only Growth section despite send-referral-
// code-sms having no tier or add-on check at all, base or Pro).
const SECTIONS = [
  {
    title: 'Dispatch & live tracking',
    items: [
      ['📍', 'Live GPS map', 'See every technician\'s real-time location on one map — no phone calls to "check in" needed.'],
      ['🗂️', 'Dispatch board & job scheduling', 'Assign jobs to technicians and see the day\'s schedule at a glance.'],
      ['✅', 'Job start / complete tracking', 'Technicians mark jobs started and completed from their phone — the dispatcher view updates live.'],
      ['📶', 'Works offline', 'If a technician\'s phone loses signal, location updates queue on the phone and send the moment it reconnects. Nothing is lost.'],
    ],
  },
  {
    title: 'Client communication',
    items: [
      ['📱', 'Automatic ETA SMS', 'Clients get a text with a live tracking link once their technician is close by (within ~2km) — no app for the client to install either.'],
      ['💬', 'Automatic lead intake', 'A chat widget for your website triages enquiries and texts your team qualified leads, scored by urgency.'],
      ['🔁', 'Referral nudges', 'A single low-pressure referral-code text is sent to happy clients after a paid invoice — not a spam campaign. Included on every plan.'],
    ],
  },
  {
    title: 'Operations (Pro)',
    items: [
      ['🧾', 'On-site invoicing', 'Technicians can raise an invoice from the job on their phone.'],
      ['🧰', 'Asset tracking', 'Track company assets (vehicles, equipment) alongside technicians.'],
      ['📋', 'Compliance & onboarding checklists', 'Standardize what every technician must complete before and during a job.'],
      ['📦', 'Materials & inventory tracking', 'Know what stock is on hand and what has been used per job.'],
      ['🪪', 'Technician credential tracking', 'Keep licenses, certifications, and inductions on file per technician.'],
    ],
  },
  {
    title: 'Growth (Pro)',
    items: [
      ['📈', 'Automated growth marketing suggestions', 'Drafts for outreach, ad campaigns, and follow-ups are generated for you to review — every send requires your explicit approval, nothing goes out automatically.'],
    ],
  },
  {
    title: 'Multi-site & Enterprise (Industrial sector)',
    items: [
      ['🛰️', 'Asset telemetry & geofencing', 'Track engine hours, maintenance intervals, and geofenced site zones for equipment, not just people.'],
      ['📍', 'Multi-day site tracking', 'Sites carry their own scope of work with arrival/departure check-ins, for jobs that run over multiple days.'],
      ['⚠️', 'Safety incident tracking', 'Log and acknowledge on-site safety incidents by severity.'],
      ['📦', 'Consumables reorder alerts', 'Get flagged before on-site stock runs out.'],
      ['📑', 'Client verification packages', 'Assemble evidence packages for client and compliance handoff.'],
    ],
  },
]

export default function Features() {
  useDocumentMeta({ title: 'Features', description: 'Live GPS tracking, automatic client ETA texts, dispatch scheduling, and lead intake — every feature Minerva ships, in one place.' })
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <Reveal style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '70px 24px 50px' }}>
        <span className="lp-pill"><i />EVERY REAL CAPABILITY, NO FLUFF</span>
        <h1 style={{ fontSize: 42, fontWeight: 'bold', lineHeight: 1.2, margin: '0 0 16px' }}>Everything you need to run the field.</h1>
        <p style={{ fontSize: 18, color: '#aaa', margin: 0, lineHeight: 1.6 }}>
          No app install for technicians or clients. Set up in about 20 minutes.
        </p>
      </Reveal>

      <div style={{ maxWidth: 900, margin: '0 auto 40px', padding: '0 24px' }}>
        {SECTIONS.map((section, si) => (
          <div key={section.title} style={{ marginBottom: 48 }}>
            <Reveal>
              <h2 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 20px', color: '#1D9E75' }}>{section.title}</h2>
            </Reveal>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
              {section.items.map(([icon, title, desc], i) => (
                <Reveal key={title} style={{ transitionDelay: `${(si * 60 + i * 70) % 400}ms` }}>
                  <div className="lp-card" onMouseMove={cardMove} onMouseLeave={cardLeave}>
                    <p style={{ fontSize: 26, margin: '0 0 10px' }}>{icon}</p>
                    <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, margin: '0 0 8px' }}>{title}</p>
                    <p style={{ color: '#666', fontSize: 13, margin: 0, lineHeight: 1.6 }}>{desc}</p>
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Rendered straight from src/maxAddons.js's own MAX_ADDONS catalog,
          not a hand-written list — so this section can't go stale the way
          "Review requests" sitting in the wrong section above did until
          2026-10-08. Each is an optional add-on billed on top of
          whichever plan a business is already on (not Pro-exclusive),
          with a free trial per src/maxAddons.js's TRIAL_DAYS. */}
      <div style={{ maxWidth: 900, margin: '0 auto 48px', padding: '0 24px' }}>
        <Reveal>
          <h2 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 6px', color: '#1D9E75' }}>Minerva Max add-ons</h2>
          <p style={{ color: '#888', fontSize: 14, margin: '0 0 20px' }}>Optional, one at a time, on top of any plan — not bundled, not required.</p>
        </Reveal>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
          {MAX_ADDONS.map((addon, i) => (
            <Reveal key={addon.key} style={{ transitionDelay: `${(i * 70) % 400}ms` }}>
              <div className="lp-card" onMouseMove={cardMove} onMouseLeave={cardLeave}>
                <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, margin: '0 0 4px' }}>{addon.name}</p>
                <p style={{ color: '#1D9E75', fontSize: 13, fontWeight: 'bold', margin: '0 0 8px' }}>${addon.price}/mo</p>
                <p style={{ color: '#666', fontSize: 13, margin: 0, lineHeight: 1.6 }}>{addon.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>

      <Reveal style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 24px', textAlign: 'center' }}>
        <Link to="/pricing" className="lp-cta-primary lp-cta-sm" style={{ marginRight: 12 }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
          See pricing
        </Link>
        <Link to="/start" className="lp-cta-ghost lp-cta-sm" style={{ marginRight: 12 }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
          Start free trial
        </Link>
        <Link to="/enterprise" style={{ display: 'inline-block', color: '#888', textDecoration: 'none', padding: '16px 12px', fontSize: 14 }}>
          Running a fleet? →
        </Link>
      </Reveal>

      <SiteFooter />
    </div>
  )
}
