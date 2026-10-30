import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import FleetOptimizerDemo from '../components/FleetOptimizerDemo'
import { PinIcon, VanIcon } from '../components/icons'
import { PhoneMapBackdrop, MapZoomControl, MapCompass } from '../components/MapScene'

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
  useDocumentMeta({ title: 'Demo', description: 'Watch it work in 60 seconds, no signup — see what your client sees the moment your technician is on the way.' })
  return (
    <div style={{ background: '#050811', minHeight: '100vh', color: '#fff', position: 'relative', overflow: 'hidden' }}>
      <div style={{
        position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)', width: 900, height: 500,
        background: 'radial-gradient(ellipse at center, rgba(45,95,168,0.18) 0%, rgba(29,158,117,0.08) 45%, transparent 75%)',
        pointerEvents: 'none',
      }} />

      <SiteNav />

      <div style={{ maxWidth: 680, margin: '0 auto', textAlign: 'center', padding: '60px 24px 30px', position: 'relative' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#1D9E75', fontWeight: 700, marginBottom: 14 }}>
          Live, interactive demo
        </div>
        <h1 style={{ fontSize: 38, fontWeight: 'bold', lineHeight: 1.2, margin: '0 0 14px', textWrap: 'balance' }}>
          Watch it work — 60 seconds, no signup.
        </h1>
        <p style={{ fontSize: 17, color: '#aaa', margin: '0 0 6px', lineHeight: 1.6 }}>
          This is what your client sees the moment your technician is on the way.
        </p>
        <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
          Sample demonstration with simulated data — not a real job, technician, or customer.
        </p>
      </div>

      <div style={{ maxWidth: 380, margin: '0 auto 20px', padding: '0 24px', position: 'relative' }}>
        <PhoneMockup />
      </div>

      <div style={{ maxWidth: 680, margin: '72px auto 0', padding: '0 24px', textAlign: 'center', position: 'relative' }}>
        <div style={{ fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#2D5FA8', fontWeight: 700, marginBottom: 10 }}>
          Whole-fleet optimizer
        </div>
        <h2 style={{ fontSize: 26, fontWeight: 'bold', margin: '0 0 10px', textWrap: 'balance' }}>
          Now watch it plan a whole team's day.
        </h2>
        <p style={{ fontSize: 15, color: '#aaa', margin: '0 0 24px', lineHeight: 1.6 }}>
          This is Minerva's whole-fleet optimizer, running for real against a sample fleet below — not a video, not a mockup.
        </p>
      </div>
      <div style={{ maxWidth: 620, margin: '0 auto 20px', padding: '0 24px', position: 'relative' }}>
        <FleetOptimizerDemo />
      </div>

      <div style={{ maxWidth: 680, margin: '40px auto 80px', padding: '0 24px', textAlign: 'center', position: 'relative' }}>
        <Link to="/start" style={{ display: 'inline-block', background: 'linear-gradient(135deg, #1D9E75 0%, #17805f 100%)', color: '#fff', textDecoration: 'none', padding: '16px 44px', borderRadius: 12, fontSize: 16, fontWeight: 'bold', marginRight: 12, boxShadow: '0 10px 30px rgba(29,158,117,0.35)' }}>
          Start your free 14-day trial
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
        @keyframes minerva-pulse-ring {
          0%   { transform: translate(-50%, -50%) scale(0.7); opacity: 0.55; }
          100% { transform: translate(-50%, -50%) scale(2.1); opacity: 0; }
        }
        @keyframes minerva-dot-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        .minerva-van {
          animation: minerva-van-move 6s ease-in-out infinite alternate;
        }
        .minerva-van-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 26px;
          height: 26px;
          border-radius: 99px;
          background: #1D9E75;
          animation: minerva-pulse-ring 1.8s ease-out infinite;
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
    <div style={{ position: 'relative', perspective: 1500 }}>
      {/* Grounding shadow beneath the tilted device, so it reads as an
          object floating in 3D space rather than a flat panel. */}
      <div style={{
        position: 'absolute', left: '12%', right: '6%', bottom: -16, height: 30,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.55), transparent 72%)',
      }} />
      <div style={{
        position: 'relative', background: '#0a0f1d', border: '1px solid #253454', borderRadius: 28, padding: 14,
        transform: 'rotateY(-9deg) rotateX(3deg)', transformStyle: 'preserve-3d', transformOrigin: 'center',
        boxShadow: '24px 30px 54px rgba(0,0,0,0.55), -6px 0 0 rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.05)',
      }}>
        {/* Glass highlight across the bezel */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 28, pointerEvents: 'none',
          background: 'linear-gradient(115deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0) 28%)',
        }} />

        {/* Map area — hand-built SVG street scene, not Mapbox (see MapScene.jsx) */}
        <div style={{ position: 'relative', height: 220, borderRadius: 18, overflow: 'hidden' }}>
          <PhoneMapBackdrop />
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 30%, transparent 55%, rgba(5,8,17,0.55) 100%)' }} />

          <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
            <defs>
              <linearGradient id="route-grad" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#2D5FA8" />
                <stop offset="100%" stopColor="#1D9E75" />
              </linearGradient>
            </defs>
            <path d="M8,62 C 25,50 35,40 38,38 C 50,45 55,50 60,55 C 68,45 74,35 78,30 C 82,25 86,22 90,18"
              stroke="#05070d" strokeWidth="3.2" fill="none" strokeLinecap="round" opacity="0.5" vectorEffect="non-scaling-stroke" />
            <path d="M8,62 C 25,50 35,40 38,38 C 50,45 55,50 60,55 C 68,45 74,35 78,30 C 82,25 86,22 90,18"
              stroke="url(#route-grad)" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.95" vectorEffect="non-scaling-stroke" />
          </svg>

          <PinIcon size={22} style={{ position: 'absolute', right: '6.5%', top: '9%', color: '#fff', filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.6))' }} />

          <div className="minerva-van" style={{ position: 'absolute', transform: 'translate(-50%, -50%)' }}>
            <span className="minerva-van-pulse" />
            <span style={{
              position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 26, height: 26, borderRadius: 99, background: '#1D9E75', color: '#fff',
              boxShadow: '0 3px 10px rgba(0,0,0,0.5)', border: '2px solid rgba(255,255,255,0.85)',
            }}>
              <VanIcon size={14} />
            </span>
          </div>

          <MapCompass compact />
          <MapZoomControl compact corner="top-right" />

          <div style={{ position: 'absolute', bottom: 10, left: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(5,8,17,0.65)', backdropFilter: 'blur(2px)', padding: '5px 10px', borderRadius: 8, fontSize: 11, color: '#9fb8d8' }}>
            <span style={{ width: 6, height: 6, borderRadius: 99, background: '#1D9E75', display: 'inline-block', animation: 'minerva-dot-pulse 1.6s ease-in-out infinite' }} />
            Live tracking · sample data
          </div>
        </div>

        {/* Simulated SMS thread */}
        <div style={{ minHeight: 130, marginTop: 14 }}>
          <div className="minerva-sms-1" style={{ background: '#1D9E75', color: '#fff', padding: '10px 14px', borderRadius: '14px 14px 14px 4px', fontSize: 13, lineHeight: 1.45, marginBottom: 8, maxWidth: '85%', boxShadow: '0 4px 10px rgba(0,0,0,0.25)' }}>
            Hi Sarah, this is Minerva Plumbing — your technician Dave is on the way. Track him live: minerva.link/j8x2
          </div>
          <div className="minerva-sms-2" style={{ background: '#1D9E75', color: '#fff', padding: '10px 14px', borderRadius: '14px 14px 14px 4px', fontSize: 13, lineHeight: 1.45, marginBottom: 8, maxWidth: '85%', boxShadow: '0 4px 10px rgba(0,0,0,0.25)' }}>
            Dave is approximately 4 minutes away.
          </div>
          <div className="minerva-sms-3" style={{ background: '#1D9E75', color: '#fff', padding: '10px 14px', borderRadius: '14px 14px 14px 4px', fontSize: 13, lineHeight: 1.45, maxWidth: '85%', boxShadow: '0 4px 10px rgba(0,0,0,0.25)' }}>
            Dave has arrived. Job completed at 2:41pm — thank you for choosing us.
          </div>
        </div>
      </div>
    </div>
  )
}
