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
// describe as real and deployed.
//
// 2026-10-31 — widened from "trade business owner only" to every
// customer-facing domain in AGENT_PANTHEON.md, including the Industrial
// Sector group this page previously left out entirely (9 of its 11
// functions are genuinely customer-facing — matched to an industrial
// site operator, not a trade business — and belong here just as much as
// the dispatch group does). Still deliberately excluded, and always will
// be: AGENT_PANTHEON.md's "Sales & Outreach" and "Agent Operating
// System" domains, plus `harvest-industrial-leads`/`enrich-industrial-
// leads` from the Industrial group — these are Minerva's own internal
// machinery (the system that finds and drafts outreach to Minerva's
// *own* prospects, health checks, the operator's own weekly report).
// None of that runs "for" a customer the way everything below does, so
// listing it here would describe Minerva's own back office, not a
// product benefit — the one line this page won't cross even when asked
// to be exhaustive.
const GROUPS = [
  {
    name: 'Dispatch & field ops',
    blurb: 'The parts that used to mean a radio call or a guess — handled before anyone has to think about it.',
    items: [
      ['Assigns the nearest free technician to a new job', 'auto', 'The job goes to the right person in seconds — not after three phone calls to figure out who’s free and closest.'],
      ['Texts the technician their new job the moment they’re assigned', 'auto', 'No relaying job details over the phone or waiting for someone to check a board.'],
      ['Texts the client "on the way" the instant a technician is within 2km — a real location trigger, not a timer', 'auto', 'Stops the "where are you" calls before they start — the client is already watching the van arrive.'],
      ['Texts the client the moment the job is marked complete', 'auto', 'Closes the loop automatically, so the client always knows where things stand without having to ask.'],
      ['Catches no-shows and wasted trips by checking GPS against the job list', 'auto', 'You get proof, not a guess, the moment a job doesn’t go to plan — useful the instant a client disputes it.'],
      ['Flags when one technician is carrying more load than the rest', 'auto', 'Catches burnout before it costs you your best technician, instead of after.'],
      ['Re-plans one technician’s day into a shorter driving order', 'click', 'Less driving, more jobs fit into the same day — without anyone manually re-ordering a list.'],
      ['Re-plans the whole team’s jobs and routes at once — only applied when it’s a genuine improvement', 'click', 'The entire day’s roster gets smarter in one click, not just one person’s trip.'],
    ],
  },
  {
    name: 'New business',
    blurb: 'What happens to a new enquiry before your team ever sees it.',
    items: [
      ['AI chat on the site triages a new enquiry and captures it, day or night', 'auto', 'A lead at 11pm gets captured instead of lost to the next search result.'],
      ['AI phone line answers a missed call and texts the caller back immediately', 'auto', 'A missed call stops being a lost job — the caller gets a text back before they’ve even hung up on voicemail.'],
      ['Keeps a new lead warm with two quiet follow-ups before it goes cold', 'auto', 'Fewer quotes die from simple silence — someone always follows up, even when your team’s flat out.'],
      ['One respectful re-engagement text, 14 days after a lead goes cold — never repeated', 'auto', 'One more honest shot at a job you’d otherwise have written off, without pestering anyone.'],
    ],
  },
  {
    name: 'Existing clients',
    blurb: 'The quiet work of keeping a past client, instead of losing them to whoever they Google next time.',
    items: [
      ['Answers an existing client’s question about their own job or invoice, any time', 'auto', 'Clients get an answer instantly instead of waiting on a callback.'],
      ['One low-pressure check-in after 30 days of silence from a past client', 'auto', 'Past clients hear from you again before they’ve forgotten you exist — without feeling sold to.'],
      ['A referral text sent the moment an invoice is paid — never a sales sequence', 'auto', 'Turns a happy, just-paid client into a referral opportunity at the exact moment they’re most satisfied.'],
    ],
  },
  {
    name: 'Quoting, invoicing & getting paid',
    blurb: 'From "what will this cost" to money actually landing in your account — without you chasing any of it.',
    items: [
      ['Drafts a line-item quote from a plain-English job description', 'auto', 'Turns "fix the leaking tap in the ensuite" into a proper itemised quote in seconds, not twenty minutes at a desk.'],
      ['Texts the invoice the moment a technician finishes the job', 'auto', 'You get paid faster because the invoice goes out the moment the job’s done, not whenever someone remembers to send it.'],
      ['Chases an unpaid invoice every 3 days — stops the instant it’s paid', 'auto', 'Outstanding invoices get chased automatically, so collections stop depending on someone remembering to follow up.'],
      ['Requests a review once a job is paid — never before', 'auto', 'Your review count grows on its own, timed for when a client’s actually happy, not randomly.'],
      ['Keeps what Stripe shows you’ve been paid in sync with what you’ve billed', 'auto', 'Your books match reality without someone manually reconciling two systems.'],
    ],
  },
  {
    name: 'Growth & marketing — never spends without you',
    blurb: 'A weekly marketing plan you don’t have to write yourself, and nothing spends your money without your say-so.',
    items: [
      ['Drafts an ad idea and a win-back message each week, based on which suburbs have gone quiet', 'draft', 'A ready-to-approve growth plan every week, without paying an agency to produce it.'],
      ['Launches the ad — only the moment you click Approve', 'click', 'Nothing spends your money without you seeing it first.'],
      ['Sends the win-back text — only the moment you click Approve', 'click', 'Same control, for reaching out to a lapsed client.'],
    ],
  },
  {
    name: 'Safety & compliance',
    blurb: 'The paperwork nobody wants to do, done automatically, and ready the moment you need it.',
    items: [
      ['Reviews technician checklist photos for later dispute protection', 'auto', 'A clean, reviewed record exists before a dispute ever happens, not scrambled together after.'],
      ['Tracks every technician’s licence/ticket expiry — escalates hard if they’re on a job with it expired', 'auto', 'Nobody turns up to a job on an expired ticket because a spreadsheet didn’t get checked that week.'],
      ['Assembles a compliance evidence package on request', 'click', 'One document, ready to hand to a client or inspector, instead of pulling records together by hand.'],
    ],
  },
  {
    name: 'Materials & weather',
    blurb: 'The two things that quietly derail a day — running out of a part, or the weather turning — caught before they do.',
    items: [
      ['Flags stock below its reorder threshold, once per low-stock episode', 'auto', 'You find out you’re low on parts before a job gets held up, not during it.'],
      ['Checks tomorrow’s weather-sensitive jobs against the forecast and drafts a reschedule — sent only on your approval', 'draft', 'A client gets rescheduled before bad weather ruins the job, instead of a wasted trip and an annoyed customer.'],
    ],
  },
  {
    name: 'Reporting',
    blurb: 'What actually happened, laid out for you — instead of scattered across five places.',
    items: [
      ['A daily summary of the last 24 hours, every morning, with nothing silently skipped', 'auto', 'You start the day already knowing what happened yesterday, without digging through separate systems.'],
      ['A per-technician transit estimate, for businesses that report on it', 'auto', 'Real numbers for a conversation about efficiency, not a guess.'],
    ],
  },
  {
    name: 'Accounting — Xero',
    blurb: 'From a job finishing to your books actually reflecting it, without anyone retyping anything.',
    items: [
      ['Connects your Xero account in a few clicks', 'click', 'A one-time setup — after that, nothing needs typing twice between Minerva and Xero.'],
      ['Pushes every invoice into Xero as a draft, ready for your review', 'auto', 'Keeps your books current automatically, while you still get the final say before anything posts.'],
    ],
  },
  {
    name: 'Sustainability',
    blurb: 'A real number, for the client or the report that asks for one.',
    items: [
      ['A daily per-technician estimate of transit CO2-e from that day’s completed jobs', 'auto', 'An actual figure for a sustainability report or a client who asks — not a marketing guess.'],
    ],
  },
  {
    name: 'Industrial sector',
    blurb: 'For industrial and heavy-equipment site operations specifically — a different customer, the same honest-automation rules as everything above.',
    items: [
      ['Matches an urgent lead to the nearest available asset and flags it for your team — never auto-commits equipment', 'draft', 'A fast, informed starting point for an urgent job — the decision to commit equipment still stays with your team.'],
      ['Suggests the nearest unassigned asset for any site that doesn’t have one yet', 'auto', 'Assets get matched to sites automatically, every 30 minutes, instead of someone checking manually.'],
      ['Real-time ingestion of your own equipment’s telemetry', 'auto', 'The ground-truth data every other industrial feature here is built on.'],
      ['Flags any asset that’s gone quiet with no telemetry', 'auto', 'You find out equipment has gone idle or offline the same day, not weeks later.'],
      ['Projects maintenance needs from real usage data, before the reactive threshold trips', 'auto', 'Maintenance gets scheduled ahead of a breakdown, not after one.'],
      ['Assembles telemetry, check-in and safety evidence into a client sign-off package', 'click', 'One document that proves what happened on site, instead of rebuilding it from memory for every client.'],
      ['Escalates any safety incident left unacknowledged for 24+ hours', 'auto', 'Nothing flagged as a safety issue quietly falls through the cracks.'],
      ['Flags when a technician and an automated process are both "on site" at once', 'auto', 'A real proximity hazard gets caught in real time, not after the fact.'],
      ['Nudges your team in Slack when a handoff is waiting on a human', 'auto', 'Nothing sits finished-but-unclaimed because nobody saw it.'],
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
          This isn’t a roadmap or a pitch — it’s the real list of what’s already running inside Minerva, right now, for every business on it. Dispatch and the fleet optimizer are the part you’ve seen. This is the rest: what each one actually does, and what it changes for you day to day.
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
            <h2 style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#5c6684', margin: '0 0 8px', paddingBottom: 0, border: 'none' }}>
              {group.name}
            </h2>
            {group.blurb && (
              <p style={{ fontSize: 14, color: '#6b7593', lineHeight: 1.5, margin: '0 0 16px', paddingBottom: 10, borderBottom: '1px solid #1b2336' }}>
                {group.blurb}
              </p>
            )}
            <div>
              {group.items.map(([text, tag, result]) => (
                <div key={text} style={{ padding: '14px 0', borderBottom: '1px solid #141b2c' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <span style={{ flexShrink: 0, width: 6, height: 6, borderRadius: 99, background: TAG_COLOR[tag], marginTop: 8 }} />
                    <span style={{ flex: 1, fontSize: 14.5, color: '#dfe5f5', lineHeight: 1.55, fontWeight: 600 }}>{text}</span>
                    <span style={{
                      flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                      color: TAG_COLOR[tag], border: `1px solid ${TAG_COLOR[tag]}`, borderRadius: 99, padding: '3px 9px', whiteSpace: 'nowrap',
                    }}>
                      {TAG_LABEL[tag]}
                    </span>
                  </div>
                  {result && (
                    <p style={{ margin: '6px 0 0 20px', fontSize: 13, color: '#8a93ac', lineHeight: 1.55 }}>
                      → {result}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 620, margin: '20px auto 110px', padding: '0 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 13, color: '#5c6684', lineHeight: 1.6, marginBottom: 36 }}>
          Which of these apply depends on your plan and your sector — the Industrial sector group above runs for industrial/heavy-equipment site operations, not trade businesses, and everything else is the reverse. See <Link to="/pricing" style={{ color: '#9aa4bc' }}>Pricing</Link> for what’s included at each tier. Nothing above is simulated or planned — it’s the real system, running today.
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
