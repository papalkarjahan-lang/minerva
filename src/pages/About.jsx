import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { Reveal } from '../hooks/useReveal'
import { magneticMove, magneticLeave } from '../utils/interactions'
import '../styles/interactive.css'

// Deliberately honest and minimal. No fabricated founding story, team
// bios, office address, or "founded in [year] by [names]" filler — none
// of that exists yet, and this page won't pretend it does. If real
// company details (ABN, address, founders) become available, add them
// here explicitly rather than inventing placeholders.
export default function About() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '70px 24px 80px' }}>
        <Reveal><h1 style={{ fontSize: 40, fontWeight: 'bold', margin: '0 0 24px' }}>About Minerva</h1></Reveal>

        <Reveal style={{ transitionDelay: '60ms' }}>
          <p style={{ color: '#ccc', fontSize: 17, lineHeight: 1.8, margin: '0 0 20px' }}>
            Minerva exists because too much of running a field-service business —
            plumbing, electrical, HVAC, locksmithing, cleaning &amp; pest control —
            still runs on phone calls. "Where are you now?" "How far out is the
            tech?" "Did the job get done?" Those are questions a live map and an
            automatic text should answer, not a dispatcher on hold.
          </p>
        </Reveal>

        <Reveal style={{ transitionDelay: '120ms' }}>
          <p style={{ color: '#ccc', fontSize: 17, lineHeight: 1.8, margin: '0 0 20px' }}>
            So Minerva is built around one idea: technicians and clients
            shouldn't need to install anything. It opens straight in a phone's
            browser from a text link — no app store, no account to create — and
            the dispatcher gets a live map, automatic client tracking texts, and
            job status without picking up the phone.
          </p>
        </Reveal>

        <Reveal style={{ transitionDelay: '180ms' }}>
          <p style={{ color: '#ccc', fontSize: 17, lineHeight: 1.8, margin: '0 0 20px' }}>
            Minerva is an Antikythera / Krios AI product.
          </p>
        </Reveal>

        <Reveal style={{ transitionDelay: '240ms' }}>
          <p style={{ color: '#888', fontSize: 15, lineHeight: 1.8, margin: '0 0 40px' }}>
            We're early. If you run a trade or service business and want to try
            it, or you've found something that doesn't work the way it should,
            we want to hear about it.
          </p>
        </Reveal>

        <Reveal style={{ transitionDelay: '300ms' }}>
          <Link to="/contact" className="lp-cta-ghost lp-cta-sm" style={{ marginRight: 12 }} onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
            Get in touch
          </Link>
          <Link to="/start" className="lp-cta-primary lp-cta-sm" onMouseMove={magneticMove} onMouseLeave={magneticLeave}>
            Start free trial
          </Link>
        </Reveal>
      </div>

      <SiteFooter />
    </div>
  )
}
