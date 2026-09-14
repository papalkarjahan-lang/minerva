import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'

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
        <h1 style={{ fontSize: 40, fontWeight: 'bold', margin: '0 0 24px' }}>About Minerva</h1>

        <p style={{ color: '#ccc', fontSize: 17, lineHeight: 1.8, margin: '0 0 20px' }}>
          Minerva exists because too much of running a field-service business —
          plumbing, electrical, HVAC, locksmithing, cleaning &amp; pest control —
          still runs on phone calls. "Where are you now?" "How far out is the
          tech?" "Did the job get done?" Those are questions a live map and an
          automatic text should answer, not a dispatcher on hold.
        </p>

        <p style={{ color: '#ccc', fontSize: 17, lineHeight: 1.8, margin: '0 0 20px' }}>
          So Minerva is built around one idea: technicians and clients
          shouldn't need to install anything. It opens straight in a phone's
          browser from a text link — no app store, no account to create — and
          the dispatcher gets a live map, automatic client tracking texts, and
          job status without picking up the phone.
        </p>

        <p style={{ color: '#ccc', fontSize: 17, lineHeight: 1.8, margin: '0 0 20px' }}>
          Minerva is an Antikythera / Krios AI product.
        </p>

        <p style={{ color: '#888', fontSize: 15, lineHeight: 1.8, margin: '0 0 40px' }}>
          We're early. If you run a trade or service business and want to try
          it, or you've found something that doesn't work the way it should,
          we want to hear about it.
        </p>

        <Link to="/contact" style={{ display: 'inline-block', background: '#2D5FA8', color: '#fff', textDecoration: 'none', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 'bold', marginRight: 12 }}>
          Get in touch
        </Link>
        <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '14px 32px', borderRadius: 10, fontSize: 15, fontWeight: 'bold' }}>
          Start free trial
        </Link>
      </div>

      <SiteFooter />
    </div>
  )
}
