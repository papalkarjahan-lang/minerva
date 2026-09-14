import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'

// Every item below is a real, shipped capability — cross-checked against
// LandingPage.jsx's pricing tiers and features grid rather than invented
// for this page. Nothing here claims a capability that doesn't exist yet
// (no fake integrations, no "AI-powered" fluff for things that are just
// a database query).
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
      ['⭐', 'Review requests', 'Send a review-request text after a job is marked complete, with click tracking so you know it landed.'],
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
      ['🔁', 'Referral nudges', 'A single low-pressure referral-code text is sent to happy clients after a paid invoice — not a spam campaign.'],
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
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '70px 24px 50px' }}>
        <h1 style={{ fontSize: 42, fontWeight: 'bold', lineHeight: 1.2, margin: '0 0 16px' }}>Everything you need to run the field.</h1>
        <p style={{ fontSize: 18, color: '#aaa', margin: 0, lineHeight: 1.6 }}>
          No app install for technicians or clients. Set up in about 20 minutes.
        </p>
      </div>

      <div style={{ maxWidth: 900, margin: '0 auto 40px', padding: '0 24px' }}>
        {SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: 48 }}>
            <h2 style={{ fontSize: 22, fontWeight: 'bold', margin: '0 0 20px', color: '#1D9E75' }}>{section.title}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
              {section.items.map(([icon, title, desc]) => (
                <div key={title} style={{ background: '#0a0f1d', borderRadius: 16, padding: 22, border: '1px solid #1e293b' }}>
                  <p style={{ fontSize: 26, margin: '0 0 10px' }}>{icon}</p>
                  <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 15, margin: '0 0 8px' }}>{title}</p>
                  <p style={{ color: '#666', fontSize: 13, margin: 0, lineHeight: 1.6 }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 24px', textAlign: 'center' }}>
        <Link to="/pricing" style={{ display: 'inline-block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '16px 44px', borderRadius: 12, fontSize: 16, fontWeight: 'bold', marginRight: 12 }}>
          See pricing
        </Link>
        <Link to="/start" style={{ display: 'inline-block', background: 'transparent', color: '#fff', textDecoration: 'none', padding: '16px 44px', borderRadius: 12, fontSize: 16, fontWeight: 'bold', border: '1px solid #2D5FA8', marginRight: 12 }}>
          Start free trial
        </Link>
        <Link to="/enterprise" style={{ display: 'inline-block', color: '#888', textDecoration: 'none', padding: '16px 12px', fontSize: 14 }}>
          Running a fleet? →
        </Link>
      </div>

      <SiteFooter />
    </div>
  )
}
