// Honest "who this is for" section — the outreach drafts already target
// electricians, plumbers, locksmiths, cleaners and facilities management
// (see OUTREACH_DRAFTS_TOP_PICKS.md), but the public site only ever told
// a single plumbing story (Dave/Sarah, above). This makes the real
// breadth explicit instead of leaving a construction crew or an HVAC
// business to guess whether Minerva applies to them.
//
// Deliberately no customer logos, names, or case-study numbers here —
// there are no real customers yet (see SALES_CLAIMS_ACCURACY_NOTE.md).
// Each line describes a real, already-shipped capability (GPS tracking,
// client SMS updates, whole-fleet optimization) applied to that trade's
// own situation, not a feature that doesn't exist.

const CREWS = [
  { name: 'Electrical contractors', line: 'Dispatch sparkies across call-outs and scheduled jobs without the group-chat guesswork.' },
  { name: 'Plumbing & gas fitting', line: 'Clients see exactly when their plumber is on the way — the single biggest driver of "where are you" calls.' },
  { name: 'Construction & site crews', line: 'Know which crew is on which site right now, and keep subcontractors and site visits on one schedule.' },
  { name: 'Locksmiths', line: 'Urgent lockouts routed to whoever is actually closest, not whoever picks up the phone first.' },
  { name: 'HVAC & refrigeration', line: 'Multi-stop maintenance runs replanned in seconds when a priority breakdown call comes in.' },
  { name: 'Cleaning & facilities', line: 'One dashboard for a roster covering dozens of sites, instead of a spreadsheet nobody trusts.' },
  { name: 'Garage door & access', line: 'Same-day installs and repairs slotted in around the existing run, not bolted on at the end of it.' },
  { name: 'Landscaping & grounds', line: 'Recurring rounds optimized the same way one-off jobs are — less driving between properties, more mowing.' },
]

export default function CrewTypes() {
  return (
    <div style={{ maxWidth: 1040, margin: '120px auto 0', padding: '0 24px' }}>
      <div style={{ textAlign: 'center', marginBottom: 40 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8089a6', fontWeight: 600, marginBottom: 18 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: '#2D5FA8', display: 'inline-block' }} />
          Built for every on-site crew
        </div>
        <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 34px)', fontWeight: 800, letterSpacing: '-0.015em', margin: '0 0 12px', textWrap: 'balance' }}>
          Not just plumbers.
        </h2>
        <p style={{ fontSize: 16, color: '#9aa4bc', margin: '0 auto', lineHeight: 1.6, maxWidth: 480 }}>
          Anyone who sends people to a job site runs into the same problem. Same dispatch and tracking underneath, whatever the trade.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 1, background: '#1b2336', border: '1px solid #1b2336', borderRadius: 16, overflow: 'hidden' }}>
        {CREWS.map(c => (
          <div key={c.name} style={{ background: '#0a0f1d', padding: '24px 22px' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{c.name}</div>
            <div style={{ fontSize: 13.5, color: '#8a93a8', lineHeight: 1.55 }}>{c.line}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
