import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import { CheckCircleIcon, BoltIcon, ReceiptIcon } from '../components/icons'

// This page answers a real question the founder asked: "what makes this
// feel like the operating system of a trade business, not just a GPS
// tracker?" The honest answer wasn't a new feature — it was that this
// already exists in the backend (see AGENT_PANTHEON.md's 90+ single-
// purpose functions) and was never shown anywhere a prospect could see
// it. Every line below is a real, already-shipped function, translated
// out of that doc's internal naming into plain customer language. No new
// capability is claimed here that AGENT_PANTHEON.md doesn't already
// describe as real and deployed. Industrial-only and pure internal-infra
// functions (health checks, the operator's own weekly report) are left
// out deliberately — this page is what a TRADE business owner would see
// running for them specifically.
const GROUPS = [
  {
    name: 'Dispatch & field ops',
    items: [
      ['Assigns the nearest free technician to a new job', 'auto'],
      ['Texts the technician their new job the moment they’re assigned', 'auto'],
      ['Texts the client "on the way" the instant a technician is within 2km — a real location trigger, not a timer', 'auto'],
      ['Texts the client the moment the job is marked complete', 'auto'],
      ['Catches no-shows and wasted trips by checking GPS against the job list', 'auto'],
      ['Flags when one technician is carrying more load than the rest', 'auto'],
      ['Re-plans one technician’s day into a shorter driving order', 'click'],
      ['Re-plans the whole team’s jobs and routes at once — only applied when it’s a genuine improvement', 'click'],
    ],
  },
  {
    name: 'New business',
    items: [
      ['AI chat on the site triages a new enquiry and captures it, day or night', 'auto'],
      ['AI phone line answers a missed call and texts the caller back immediately', 'auto'],
      ['Keeps a new lead warm with two quiet follow-ups before it goes cold', 'auto'],
      ['One respectful re-engagement text, 14 days after a lead goes cold — never repeated', 'auto'],
    ],
  },
  {
    name: 'Existing clients',
    items: [
      ['Answers an existing client’s question about their own job or invoice, any time', 'auto'],
      ['One low-pressure check-in after 30 days of silence from a past client', 'auto'],
      ['A referral text sent the moment an invoice is paid — never a sales sequence', 'auto'],
    ],
  },
  {
    name: 'Quoting, invoicing & getting paid',
    items: [
      ['Drafts a line-item quote from a plain-English job description', 'auto'],
      ['Texts the invoice the moment a technician finishes the job', 'auto'],
      ['Chases an unpaid invoice every 3 days — stops the instant it’s paid', 'auto'],
      ['Requests a review once a job is paid — never before', 'auto'],
      ['Keeps what Stripe shows you’ve been paid in sync with what you’ve billed', 'auto'],
    ],
  },
  {
    name: 'Growth & marketing — never spends without you',
    items: [
      ['Drafts an ad idea and a win-back message each week, based on which suburbs have gone quiet', 'draft'],
      ['Launches the ad — only the moment you click Approve', 'click'],
      ['Sends the win-back text — only the moment you click Approve', 'click'],
    ],
  },
  {
    name: 'Safety & compliance',
    items: [
      ['Reviews technician checklist photos for later dispute protection', 'auto'],
      ['Tracks every technician’s licence/ticket expiry — escalates hard if they’re on a job with it expired', 'auto'],
    ],
  },
  {
    name: 'Materials & weather',
    items: [
      ['Flags stock below its reorder threshold, once per low-stock episode', 'auto'],
      ['Checks tomorrow’s weather-sensitive jobs against the forecast and drafts a reschedule — sent only on your approval', 'draft'],
    ],
  },
  {
    name: 'Reporting',
    items: [
      ['A daily summary of the last 24 hours, every morning, with nothing silently skipped', 'auto'],
      ['A per-technician transit estimate, for businesses that report on it', 'auto'],
    ],
  },
]

const TAG_LABEL = { auto: 'Runs on its own', draft: 'Drafts only — you approve', click: 'Starts on your click' }
const TAG_COLOR = { auto: '#1D9E75', draft: '#E8A33D', click: '#2D5FA8' }

export default function Platform() {
  useDocumentMeta({
    title: 'Platform',
    description: 'The real list of what’s already running inside Minerva, every day, for every business on it — not a roadmap, the actual system.',
  })
  return (
    <div style={{ background: '#080c16', minHeight: '100vh', color: '#fff' }}>
      <div style={{
        position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)', width: 900, height: 500,
        background: 'radial-gradient(ellipse at center, rgba(45,95,168,0.18) 0%, rgba(29,158,117,0.08) 45%, transparent 75%)',
        pointerEvents: 'none',
      }} />

      <SiteNav />

      <div style={{ maxWidth: 740, margin: '0 auto', textAlign: 'center', padding: '88px 24px 20px', position: 'relative' }}>
        <Eyebrow>Always running</Eyebrow>
        <h1 style={{ fontSize: 'clamp(36px, 5.6vw, 56px)', fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.02em', margin: '0 0 20px', textWrap: 'balance' }}>
          Every day, without you touching it.
        </h1>
        <p style={{ fontSize: 18, color: '#9aa4bc', margin: '0 auto', lineHeight: 1.6, maxWidth: 580 }}>
          This isn’t a roadmap or a pitch — it’s the real list of what’s already running inside Minerva, right now, for every business on it. Dispatch and the fleet optimizer are the part you’ve seen. This is the rest.
        </p>
      </div>

      <div style={{ maxWidth: 920, margin: '56px auto 0', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        <PrincipleCard icon={CheckCircleIcon} title="One job, each" text="No single do-everything AI. Dozens of small, specific pieces — the one that texts a client never decides pricing, the one that drafts an ad never spends on it." />
        <PrincipleCard icon={ReceiptIcon} title="Never spends without you" text="Nothing that costs money or contacts a new prospect fires on its own. Every one drafts, waits, and only acts the moment you click approve." />
        <PrincipleCard icon={BoltIcon} title="Switch off any one, instantly" text="Each piece can be turned off on its own — no redeploy, no effect on anything else — if it ever does something you don’t want." />
      </div>

      <div style={{ maxWidth: 820, margin: '90px auto 0', padding: '0 24px' }}>
        {GROUPS.map(group => (
          <div key={group.name} style={{ marginBottom: 46 }}>
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5c6684', margin: '0 0 16px', paddingBottom: 10, borderBottom: '1px solid #1b2336' }}>
              {group.name}
            </h2>
            <div>
              {group.items.map(([text, tag]) => (
                <div key={text} style={{ display: 'flex', alignItems: 'flex-start', gap: 14, padding: '12px 0', borderBottom: '1px solid #141b2c' }}>
                  <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 99, background: TAG_COLOR[tag], marginTop: 8 }} />
                  <span style={{ flex: 1, fontSize: 14.5, color: '#dfe5f5', lineHeight: 1.55 }}>{text}</span>
                  <span style={{
                    flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                    color: TAG_COLOR[tag], border: `1px solid ${TAG_COLOR[tag]}`, borderRadius: 99, padding: '3px 9px', whiteSpace: 'nowrap',
                  }}>
                    {TAG_LABEL[tag]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 620, margin: '20px auto 110px', padding: '0 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#5c6684', lineHeight: 1.6, marginBottom: 36 }}>
          Which of these apply depends on your plan — see <Link to="/pricing" style={{ color: '#9aa4bc' }}>Pricing</Link> for what’s included at each tier. Nothing above is simulated or planned — it’s the real system, running today.
        </p>
        <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#06130e', textDecoration: 'none', padding: '17px 40px', borderRadius: 10, fontSize: 16, fontWeight: 700, marginRight: 12 }}>
          Start your free 14-day trial
        </Link>
        <Link to="/demo" style={{ display: 'inline-block', background: 'transparent', color: '#fff', textDecoration: 'none', padding: '17px 40px', borderRadius: 10, fontSize: 16, fontWeight: 700, border: '1px solid #262f44' }}>
          Watch it work
        </Link>
      </div>

      <SiteFooter />
    </div>
  )
}

function Eyebrow({ children }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8089a6', fontWeight: 600, marginBottom: 18 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: '#1D9E75', display: 'inline-block' }} />
      {children}
    </div>
  )
}

function PrincipleCard({ icon: Icon, title, text }) {
  return (
    <div style={{ background: '#0e1424', border: '1px solid #1b2336', borderRadius: 14, padding: '22px 20px' }}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: '#101729', border: '1px solid #262f44', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1D9E75', marginBottom: 14 }}>
        <Icon size={16} />
      </div>
      <div style={{ fontSize: 14.5, fontWeight: 700, color: '#fff', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12.5, color: '#8a93a8', lineHeight: 1.55 }}>{text}</div>
    </div>
  )
}
