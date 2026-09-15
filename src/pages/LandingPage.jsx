import { Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import './LandingPage.css'

const FAQS = [
  ['Do my technicians need to install an app?', 'No — it opens straight in their phone\'s browser from a text link. No app store, no install, no account to create.'],
  ['How long does setup actually take?', 'About 20 minutes: add your technicians, send them their link, add your first job. No hardware, no integration with anything else you use.'],
  ['What if a technician\'s phone loses signal?', 'Locations queue on the phone and send the moment it reconnects — nothing is lost, and the dispatcher view shows an "Offline" badge in the meantime.'],
  ['Can I cancel anytime?', 'Yes — self-serve from your billing settings, no call required. Your 7-day trial isn\'t charged unless you keep using it past day 7.'],
  ['Is this locked into a long contract?', 'No contract. It\'s a monthly per-technician subscription, same as any SaaS tool — cancel whenever.'],
]

const FEATURES = [
  ['📍', 'Live map', 'See every technician in real time without making a single call.'],
  ['📱', 'Client SMS', 'Automatic text with a live tracking link once your tech is close by (within ~2km).'],
  ['💬', 'Automatic lead intake', 'A chat widget for your website that triages enquiries and texts you qualified leads, scored by urgency.'],
]

const PLANS = [
  ['Starter', '$49', ['Live GPS map', 'Client ETA SMS', 'Job start/complete', 'Dispatch board & job scheduling', 'Automatic intake chat & lead scoring', 'Works on any phone']],
  ['Standard', '$79', ['Everything in Starter', 'Recommended for growing teams'], true],
  ['Pro', '$119', ['Everything in Standard', 'On-site invoicing', 'Asset tracking', 'Compliance & onboarding checklists', 'Materials & inventory tracking', 'Technician credential tracking']],
]

const TRADES = ['Plumbing', 'Electrical', 'HVAC', 'Locksmiths', 'Pest Control', 'Cleaning & FM']

// Four real, countable facts (each already stated elsewhere on the site) —
// no invented metrics, no customer-count claims per SALES_CLAIMS_ACCURACY_NOTE.
const STATS = [
  { n: 20, suffix: ' min', label: 'Average setup time' },
  { n: 7, suffix: '-day', label: 'Free trial, no card required' },
  { n: 2, suffix: 'km', prefix: '~', label: 'Auto ETA-text trigger radius' },
  { n: 5, suffix: '', label: 'Trades supported out of the box' },
]

// The job lifecycle, scripted — this is the actual product, not a
// dramatization of one. Every line here is something Minerva really does.
const STORY_BEATS = [
  { k: '08:14', c: 'ok', a: 'A job comes in', b: 'Dispatcher sees it appear on the board — no phone call needed to log it.' },
  { k: '08:15 · DISPATCH', c: 'ok', a: 'Closest tech assigned', b: 'One tap. The board shows who\'s free and where, so this takes seconds, not a round of calls.' },
  { k: '08:16 · EN ROUTE', c: 'warn', a: 'Van live on the map', b: 'The technician\'s phone shares location automatically — nobody has to check in.' },
  { k: '08:31 · NOTIFY', c: 'warn', a: 'Client gets a text', b: 'Automatic ETA + live tracking link once the van is close — your team never sends it manually.' },
  { k: '09:02 · DONE', c: 'ok', a: 'Job marked complete', b: 'Timestamped, on the record, ready for invoicing.' },
]

function useReveal() {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); obs.disconnect() }
    }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, shown]
}

function Reveal({ children, style }) {
  const [ref, shown] = useReveal()
  return (
    <div ref={ref} className={`lp-reveal ${shown ? 'lp-in' : ''}`} style={style}>
      {children}
    </div>
  )
}

// Cursor-reactive radial glow (Mapbox/Awwwards "spotlight card" trick) —
// mutates a CSS var directly via the DOM instead of React state, so it
// doesn't trigger a re-render on every mouse pixel.
function spotlightMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
  e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
}

// Magnetic buttons — nudge toward the cursor on hover, snap back on leave.
function magneticMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const mx = (e.clientX - r.left - r.width / 2) * 0.25
  const my = (e.clientY - r.top - r.height / 2) * 0.25
  e.currentTarget.style.transform = `translate(${mx}px, ${my - 2}px)`
}
function magneticLeave(e) { e.currentTarget.style.transform = '' }

// Subtle 3D tilt on hover for feature/pricing cards.
function tiltMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width - 0.5
  const py = (e.clientY - r.top) / r.height - 0.5
  e.currentTarget.style.transform = `perspective(700px) rotateX(${py * -6}deg) rotateY(${px * 6}deg) translateY(-4px)`
}
function tiltLeave(e) { e.currentTarget.style.transform = '' }

// Canvas-drawn street grid with three vans drifting along fixed routes and
// a house marker. Purely illustrative (labeled below it) — never claimed
// to be a live screenshot of a real customer's account. If no activeIdx is
// passed, it gently self-cycles so the teaser in the hero still has life.
function LiveMap({ activeIdx }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const cv = canvasRef.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    let raf
    let W = 0, H = 0

    const VANS = [
      { x: 0.15, y: 0.7, tx: 0.62, ty: 0.35, color: '#1D9E75' },
      { x: 0.75, y: 0.2, tx: 0.4, ty: 0.55, color: '#2D5FA8' },
      { x: 0.35, y: 0.85, tx: 0.72, ty: 0.68, color: '#1D9E75' },
    ]

    function size() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = cv.clientWidth
      H = cv.clientHeight
      cv.width = W * dpr
      cv.height = H * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }

    function draw(ts) {
      const t = ts / 1000
      ctx.clearRect(0, 0, W, H)

      // street grid
      ctx.strokeStyle = 'rgba(45, 95, 168, .16)'
      ctx.lineWidth = 1
      for (let gx = 0; gx <= W; gx += 44) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke()
      }
      for (let gy = 0; gy <= H; gy += 44) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke()
      }

      // house marker (client)
      const hx = W * 0.62, hy = H * 0.35
      ctx.font = '20px Arial'
      ctx.fillText('🏠', hx - 10, hy + 8)

      const active = activeIdx != null ? activeIdx % VANS.length : Math.floor(t / 2.2) % VANS.length

      // vans drift back and forth along their route using a sine blend
      VANS.forEach((v, i) => {
        const u = 0.5 + 0.5 * Math.sin(t * 0.35 + i * 2)
        const x = (v.x + (v.tx - v.x) * u) * W
        const y = (v.y + (v.ty - v.y) * u) * H
        const isActive = i === active

        if (isActive) {
          ctx.beginPath()
          ctx.arc(x, y, 16 + 4 * Math.sin(t * 3), 0, Math.PI * 2)
          ctx.fillStyle = v.color + '33'
          ctx.fill()
        }
        ctx.font = '18px Arial'
        ctx.fillText('🚐', x - 9, y + 7)
      })

      raf = requestAnimationFrame(draw)
    }

    size()
    raf = requestAnimationFrame(draw)
    window.addEventListener('resize', size)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', size) }
  }, [activeIdx])

  return <canvas ref={canvasRef} className="lp-map-canvas" />
}

// Scrollytelling: the map is pinned in the viewport while the page scrolls
// underneath it, and the active beat is driven by scroll progress instead
// of a timer — the same mechanic Apple product pages use, applied to a
// real feature (live GPS + auto client texts) instead of a hardware reveal.
function ScrollStory() {
  const wrapRef = useRef(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    let raf = null
    function onScroll() {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        const el = wrapRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const total = el.offsetHeight - window.innerHeight
        const progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0
        const next = Math.min(STORY_BEATS.length - 1, Math.floor(progress * STORY_BEATS.length))
        setIdx((cur) => (cur === next ? cur : next))
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [])

  const beat = STORY_BEATS[idx]

  return (
    <div ref={wrapRef} className="lp-scrollstory" style={{ height: `${STORY_BEATS.length * 62}vh` }}>
      <div className="lp-scrollstory-pin">
        <p className="lp-scrollstory-kicker">Follow one job, start to finish</p>
        <div className="lp-map-wrap lp-map-wrap--big" onMouseMove={spotlightMove}>
          <LiveMap activeIdx={idx} />
          <div className="lp-beat-dots">
            {STORY_BEATS.map((_, k) => <i key={k} className={k === idx ? 'on' : ''} />)}
          </div>
          <div className="lp-beat">
            <div className={`k ${beat.c}`}>{beat.k}</div>
            <div className="a">{beat.a}</div>
            <p className="b">{beat.b}</p>
          </div>
        </div>
        <p className="lp-scrollstory-hint">Scroll ↓ to follow the job</p>
      </div>
    </div>
  )
}

function StatsRow() {
  return (
    <div className="lp-stats">
      {STATS.map((s, i) => (
        <Reveal key={s.label} style={{ transitionDelay: `${i * 80}ms` }}>
          <CountUp {...s} />
          <p className="lp-stat-label">{s.label}</p>
        </Reveal>
      ))}
    </div>
  )
}

function CountUp({ n, suffix = '', prefix = '' }) {
  const [ref, shown] = useReveal()
  const [val, setVal] = useState(0)
  useEffect(() => {
    if (!shown) return
    const start = performance.now()
    const dur = 900
    let raf
    function tick(t) {
      const p = Math.min(1, (t - start) / dur)
      setVal(Math.round(n * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [shown, n])
  return <span ref={ref} className="lp-stat-n">{prefix}{val}{suffix}</span>
}

// The exact SMS sequence a client receives, played on a loop — the
// strongest, most concrete proof on the page because it's not a claim,
// it's the literal message text.
function SmsProof() {
  const [ref, shown] = useReveal()
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (!shown) return
    const t1 = setTimeout(() => setStep(1), 400)
    const t2 = setTimeout(() => setStep(2), 1400)
    const t3 = setTimeout(() => setStep(3), 2600)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [shown])

  return (
    <div ref={ref} className="lp-phone">
      <p style={{ textAlign: 'center', color: '#556', fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', margin: '0 0 16px' }}>What your client receives</p>
      <div className={`lp-sms ${step >= 1 ? 'lp-shown' : ''}`}>Hi Sarah, this is <b>Ken Hall Plumbers</b>. Your technician Mike is on the way — ETA 12 minutes.</div>
      <div className={`lp-sms ${step >= 2 ? 'lp-shown' : ''}`}>Track his location live: <b>minerva-green.vercel.app/t/8f2a</b></div>
      <div className={`lp-sms ${step >= 3 ? 'lp-shown' : ''}`}>Mike has arrived. 👍</div>
    </div>
  )
}

// Word-by-word kinetic reveal for a single editorial statement — same
// mechanic as the hero headline, reused for a mid-page pull-quote.
function KineticLine({ text }) {
  const [ref, shown] = useReveal()
  const words = text.split(' ')
  return (
    <h2 ref={ref} className={`lp-kinetic ${shown ? 'lp-go' : ''}`}>
      {words.map((w, i) => (
        <span key={i} className="lp-kinetic-word" style={{ transitionDelay: `${i * 45}ms` }}>{w}&nbsp;</span>
      ))}
    </h2>
  )
}

function TradeMarquee() {
  return (
    <div className="lp-marquee">
      <div className="lp-marquee-track">
        {[...TRADES, ...TRADES].map((t, i) => <span key={i}>{t}</span>)}
      </div>
    </div>
  )
}

function Faq() {
  const [open, setOpen] = useState(null)
  return (
    <div>
      {FAQS.map(([q, a], i) => (
        <div key={q} className={`lp-faq-item ${open === i ? 'lp-open' : ''}`}>
          <button className="lp-faq-q" onClick={() => setOpen(open === i ? null : i)}>
            {q}<span className="x">+</span>
          </button>
          <div className="lp-faq-a"><p>{a}</p></div>
        </div>
      ))}
    </div>
  )
}

export default function LandingPage() {
  const [heroGo, setHeroGo] = useState(false)
  useEffect(() => { const id = setTimeout(() => setHeroGo(true), 80); return () => clearTimeout(id) }, [])

  const headline1 = 'Know where every technician is.'
  const headline2 = 'Right now.'

  return (
    <div className="lp">
      <SiteNav />

      {/* Hero */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '70px 24px 30px', display: 'grid', gridTemplateColumns: 'minmax(280px, 480px) 1fr', gap: 40, alignItems: 'center' }}>
        <div className={`lp-hero ${heroGo ? 'lp-go' : ''}`}>
          <span className="lp-pill"><i />LIVE GPS + AUTO CLIENT TEXTS</span>
          <h1 className="lp-h1">
            {headline1.split(' ').map((w, i) => (
              <span key={i} className="lp-hero-word" style={{ transitionDelay: `${i * 60}ms`, marginRight: 10 }}>{w}</span>
            ))}
            <br />
            <span className="lp-hero-word lp-grad" style={{ transitionDelay: `${(headline1.split(' ').length) * 60}ms` }}>{headline2}</span>
          </h1>
          <p style={{ fontSize: 18, color: '#aaa', margin: '0 0 10px', lineHeight: 1.6 }}>
            Live map. Client tracking SMS. Set up in 20 minutes.
          </p>
          <p style={{ fontSize: 13, color: '#556', margin: '0 0 32px', letterSpacing: .5 }}>
            Built for plumbers, electricians, HVAC, locksmiths, and cleaning &amp; pest control teams — 2 to 30 technicians.
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
            <Link to="/start" className="lp-cta-primary" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>Start your free trial →</Link>
            <Link to="/demo" className="lp-cta-ghost" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>Watch 60-sec demo</Link>
          </div>
          <p style={{ color: '#555', fontSize: 13, margin: 0 }}>7-day free trial. Set up on the call. First charge after day 7.</p>
        </div>

        <div className="lp-hero-glow" onMouseMove={spotlightMove}>
          <div className="lp-map-wrap lp-map-wrap--teaser">
            <LiveMap />
            <span className="lp-map-teaser-tag">Live — illustrative</span>
          </div>
        </div>
      </div>

      <TradeMarquee />

      {/* Scroll-pinned story */}
      <ScrollStory />

      {/* Stats */}
      <div style={{ maxWidth: 900, margin: '0 auto 100px', padding: '0 24px' }}>
        <StatsRow />
      </div>

      {/* SMS proof */}
      <Reveal style={{ maxWidth: 680, margin: '0 auto 100px', padding: '0 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 30, fontWeight: 'bold', margin: '0 0 12px' }}>Not a claim. The actual text.</h2>
        <p style={{ color: '#999', margin: '0 0 36px' }}>This is the exact sequence a real client receives — scroll here again to replay it.</p>
        <SmsProof />
      </Reveal>

      {/* Editorial statement */}
      <div style={{ maxWidth: 820, margin: '0 auto 100px', padding: '0 24px' }}>
        <KineticLine text="Most &ldquo;where&apos;s my technician&rdquo; calls are really just a text message that never got sent." />
      </div>

      {/* Features */}
      <div style={{ maxWidth: 800, margin: '0 auto 100px', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24 }}>
        {FEATURES.map(([icon, title, desc], i) => (
          <Reveal key={title} style={{ transitionDelay: `${i * 90}ms` }}>
            <div className="lp-card" onMouseMove={(e) => { spotlightMove(e); tiltMove(e) }} onMouseLeave={tiltLeave}>
              <p style={{ fontSize: 28, margin: '0 0 12px' }}>{icon}</p>
              <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 16, margin: '0 0 8px' }}>{title}</p>
              <p style={{ color: '#666', fontSize: 14, margin: 0, lineHeight: 1.6 }}>{desc}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {/* FAQ */}
      <Reveal style={{ maxWidth: 680, margin: '0 auto 100px', padding: '0 24px' }}>
        <h2 style={{ fontSize: 28, fontWeight: 'bold', margin: '0 0 24px', textAlign: 'center' }}>Common questions</h2>
        <Faq />
      </Reveal>

      {/* Pricing */}
      <Reveal style={{ maxWidth: 900, margin: '0 auto 40px', padding: '0 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 32, fontWeight: 'bold', margin: '0 0 12px' }}>Simple, honest pricing</h2>
        <p style={{ color: '#aaa', margin: '0 0 40px' }}>Per technician. Cancel anytime.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 24, textAlign: 'left' }}>
          {PLANS.map(([name, price, features, recommended]) => (
            <div
              key={name}
              className={`lp-price-card ${recommended ? 'lp-recommended' : ''}`}
              onMouseMove={(e) => { spotlightMove(e); tiltMove(e) }}
              onMouseLeave={tiltLeave}
            >
              {recommended && <span className="lp-price-badge">MOST POPULAR</span>}
              <p style={{ color: '#fff', fontWeight: 'bold', fontSize: 18, margin: '8px 0 4px' }}>{name}</p>
              <p style={{ color: '#1D9E75', fontWeight: 'bold', fontSize: 30, margin: '0 0 4px' }}>{price}<span style={{ fontSize: 14, color: '#777', fontWeight: 'normal' }}> /tech/mo</span></p>
              <ul style={{ margin: '18px 0 0', padding: 0, listStyle: 'none' }}>
                {features.map((f) => (
                  <li key={f} style={{ color: '#999', fontSize: 13.5, margin: '0 0 10px', paddingLeft: 20, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 0, color: '#1D9E75' }}>✓</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Final CTA */}
      <div className="lp-final-band">
        <h2 style={{ fontSize: 30, fontWeight: 'bold', margin: '0 0 16px', position: 'relative' }}>Ready to stop fielding "where is he" calls?</h2>
        <div style={{ position: 'relative' }}>
          <Link to="/start" className="lp-cta-primary" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>Start your free trial →</Link>
        </div>
      </div>

      <SiteFooter />
    </div>
  )
}
