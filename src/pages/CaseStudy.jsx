import { Link } from 'react-router-dom'

// Case study page template — NOT live-linked from the nav/footer yet on
// purpose. Every metric/quote below is a bracketed placeholder, same
// pattern as EXACT_OUTREACH_EMAIL_DRAFTS.md: fill these in with a real
// founding customer's real numbers once you have them (Day 7 testing +
// first paying customer), then link to /case-study from LandingPage.jsx's
// nav or add a dedicated "Results" section. Publishing this with the
// bracketed placeholders still in place would be a false-advertising risk
// (see SALES_CLAIMS_ACCURACY_NOTE.md) — don't link it live until it's
// filled in with something true.
//
// Structure is deliberately simple: one specific business, one specific
// pain point, one specific measurable outcome — this converts far better
// than an aggregate "customers save X hours" claim with no attribution,
// and is honest because it's about one real, named (or first-name-only,
// business's choice) customer rather than a fabricated composite.

export default function CaseStudy() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <nav style={{ padding: '20px 40px', borderBottom: '1px solid #1e293b' }}>
        <Link to="/" style={{ fontSize: 22, fontWeight: 'bold', color: '#fff', textDecoration: 'none', letterSpacing: 3 }}>MINERVA</Link>
      </nav>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '64px 24px 80px' }}>
        <p style={{ color: '#1D9E75', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 12px' }}>Case study</p>
        <h1 style={{ fontSize: 36, fontWeight: 'bold', lineHeight: 1.25, margin: '0 0 24px' }}>
          How [Business Name] cut "where are you?" calls to zero in [X] weeks
        </h1>

        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '0 0 40px', padding: '20px 24px', background: '#0a0f1d', borderRadius: 16, border: '1px solid #1e293b' }}>
          <div>
            <p style={{ color: '#555', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>Trade</p>
            <p style={{ color: '#fff', fontSize: 15, margin: 0 }}>[Plumbing / Electrical / HVAC / etc.]</p>
          </div>
          <div>
            <p style={{ color: '#555', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>Team size</p>
            <p style={{ color: '#fff', fontSize: 15, margin: 0 }}>[N] technicians</p>
          </div>
          <div>
            <p style={{ color: '#555', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, margin: '0 0 4px' }}>Location</p>
            <p style={{ color: '#fff', fontSize: 15, margin: 0 }}>[Suburb/region]</p>
          </div>
        </div>

        <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: '0 0 12px' }}>The problem</h2>
        <p style={{ color: '#aaa', fontSize: 16, lineHeight: 1.7, margin: '0 0 32px' }}>
          [One or two sentences, in the owner's own words if possible — the
          specific, concrete pain point this business actually had. e.g.
          "We were getting 15-20 'where's my technician' calls a day, and
          our office admin was spending an hour every afternoon just calling
          technicians to find out."]
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: '0 0 12px' }}>What changed</h2>
        <p style={{ color: '#aaa', fontSize: 16, lineHeight: 1.7, margin: '0 0 32px' }}>
          [What they actually use day to day — keep this concrete and
          specific to their workflow, not a generic feature list. e.g.
          "Every technician gets a text link when they're assigned a job —
          no app, no login. The client gets an automatic text with a
          tracking link once the technician is nearby, so the office phone
          stopped ringing for ETA questions entirely."]
        </p>

        <h2 style={{ fontSize: 20, fontWeight: 'bold', margin: '0 0 20px' }}>The result</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, margin: '0 0 32px' }}>
          {[
            ['[X]%', 'fewer "where are you" calls'],
            ['[X] hrs/week', 'saved on admin time'],
            ['[X] days', 'to get the whole team set up'],
          ].map(([stat, label]) => (
            <div key={label} style={{ background: '#0a0f1d', borderRadius: 14, padding: 20, border: '1px solid #1e293b', textAlign: 'center' }}>
              <p style={{ color: '#1D9E75', fontSize: 26, fontWeight: 'bold', margin: '0 0 6px' }}>{stat}</p>
              <p style={{ color: '#888', fontSize: 13, margin: 0 }}>{label}</p>
            </div>
          ))}
        </div>

        <blockquote style={{ borderLeft: '3px solid #1D9E75', margin: '0 0 40px', padding: '4px 0 4px 20px', color: '#ccc', fontSize: 17, fontStyle: 'italic', lineHeight: 1.6 }}>
          "[A real, direct quote from the business owner — get their
          permission to use it, and don't paraphrase it into something they
          didn't actually say.]"
          <footer style={{ color: '#666', fontSize: 14, fontStyle: 'normal', marginTop: 10 }}>— [Owner's first name], [Business Name]</footer>
        </blockquote>

        <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '16px 40px', borderRadius: 12, fontSize: 16, fontWeight: 'bold' }}>
          Start your free trial →
        </Link>
      </div>

      <footer style={{ borderTop: '1px solid #1e293b', padding: '24px 40px', textAlign: 'center', color: '#444', fontSize: 13 }}>
        <Link to="/" style={{ color: '#666', textDecoration: 'none' }}>← Back to Minerva</Link>
      </footer>
    </div>
  )
}
