import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'

// Public, no-signup, no-login "watch it work" page. Built 2026-09-15 to
// close a real gap: dozens of already-written outreach email drafts
// (EXACT_OUTREACH_EMAIL_DRAFTS.md, OUTREACH_DRAFTS_TOP_PICKS.md) reference
// a "[demo link]" that didn't actually exist anywhere in the app.
//
// Deliberately does NOT use react-map-gl/Mapbox — VITE_MAPBOX_TOKEN is
// still a placeholder (unset, one of the standing bank-account-gated
// blockers), so a real map would render broken for every visitor. Instead
// this is a self-contained CSS/SVG animation with clearly-labeled sample
// data — honest by construction, matches SALES_CLAIMS_ACCURACY_NOTE.md:
// nothing here claims to be a real job, real customer, or real SMS send.
export default function Demo() {
  return (
    <div style={{ fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '60px 24px 30px' }}>
        <h1 style={{ fontSize: 38, fontWeight: 'bold', lineHeight: 1.2, margin: '0 0 14px' }}>
          Watch it work — 60 seconds, no signup.
        </h1>
        <p style={{ fontSize: 17, color: '#aaa', margin: '0 0 6px', lineHeight: 1.6 }}>
          This is what your client sees the moment your technician is on the way.
        </p>
        <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
          Sample demonstration with simulated data — not a real job, technician, or customer.
        </p>
      </div>

      <div style={{ maxWidth: 380, margin: '0 auto 20px', padding: '0 24px' }}>
        <PhoneMockup />
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto 80px', padding: '0 24px', textAlign: 'center' }}>
        <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#fff', textDecoration: 'none', padding: '16px 44px', borderRadius: 12, fontSize: 16, fontWeight: 'bold', marginRight: 12 }}>
          Start your free 7-day trial
        </Link>
        <Link to="/pricing" style={{ display: 'inline-block', background: 'transparent', color: '#fff', textDecoration: 'none', padding: '16px 44px', borderRadius: 12, fontSize: 16, fontWeight: 'bold', border: '1px solid #2D5FA8' }}>
          See pricing
        </Link>
      </div>

      <SiteFooter />

      <style>{`
        @keyframes minerva-van-move {
          0%   { left: 8%; top: 62%; }
          25%  { left: 38%; top: 38%; }
          50%  { left: 60%; top: 55%; }
          75%  { left: 78%; top: 30%; }
          100% { left: 90%; top: 18%; }
        }
        @keyframes minerva-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .minerva-van {
          animation: minerva-van-move 6s ease-in-out infinite alternate;
        }
        .minerva-sms-1 { animation: minerva-fade-in 0.4s ease-out 0.6s both; }
        .minerva-sms-2 { animation: minerva-fade-in 0.4s ease-out 3.2s both; }
        .minerva-sms-3 { animation: minerva-fade-in 0.4s ease-out 5.8s both; }
      `}</style>
    </div>
  )
}

function PhoneMockup() {
  return (
    <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 28, padding: 14, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }}>
      {/* "Map" area — pure CSS/SVG, no Mapbox dependency */}
      <div style={{ position: 'relative', height: 220, borderRadius: 18, overflow: 'hidden', background: 'linear-gradient(135deg, #142033 0%, #0d1526 100%)', marginBottom: 14 }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
          <path d="M8,62 C 25,50 35,40 38,38 C 50,45 55,50 60,55 C 68,45 74,35 78,30 C 82,25 86,22 90,18"
            stroke="#2D5FA8" strokeWidth="1.2" fill="none" strokeDasharray="2,2" opacity="0.6" vectorEffect="non-scaling-stroke" />
        </svg>
        <div style={{ position: 'absolute', right: '8%', top: '15%', fontSize: 20 }}>🏠</div>
        <div className="minerva-van" style={{ position: 'absolute', fontSize: 22, transform: 'translate(-50%, -50%)' }}>🚐</div>
        <div style={{ position: 'absolute', bottom: 8, left: 10, background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: 8, fontSize: 11, color: '#9fb8d8' }}>
          Live tracking · sample data
        </div>
      </div>

      {/* Simulated SMS thread */}
      <div style={{ minHeight: 130 }}>
        <div className="minerva-sms-1" style={{ background: '#1D9E75', color: '#fff', padding: '10px 14px', borderRadius: 14, fontSize: 13, marginBottom: 8, maxWidth: '85%' }}>
          Hi Sarah, this is Minerva Plumbing — your technician Dave is on the way. Track him live: minerva.link/j8x2 🚐
        </div>
        <div className="minerva-sms-2" style={{ background: '#1D9E75', color: '#fff', padding: '10px 14px', borderRadius: 14, fontSize: 13, marginBottom: 8, maxWidth: '85%' }}>
          Dave is 12 minutes away.
        </div>
        <div className="minerva-sms-3" style={{ background: '#1D9E75', color: '#fff', padding: '10px 14px', borderRadius: 14, fontSize: 13, maxWidth: '85%' }}>
          Dave has arrived. Job completed at 2:41pm ✅
        </div>
      </div>
    </div>
  )
}
