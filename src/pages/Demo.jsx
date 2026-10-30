import { Link } from 'react-router-dom'
import { SiteNav, SiteFooter } from '../components/SiteChrome'
import { useDocumentMeta } from '../hooks/useDocumentMeta'
import FleetOptimizerDemo from '../components/FleetOptimizerDemo'
import { PinIcon } from '../components/icons'
import { PhoneMapBackdrop, MapToolbar, RouteGlowFilter } from '../components/MapScene'

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
//
// Visual language rebuilt 2026-10-30 after an isometric-toy-town version
// read as cluttered and amateurish. Calibrated instead against how
// credible B2B product pages actually look (linear.app, onfleet.com):
// oversized confident type, a near-empty dark canvas, one accent color,
// and real-looking UI chrome kept deliberately small — restraint, not
// decoration, is what reads as "serious software."
export default function Demo() {
  useDocumentMeta({ title: 'Demo', description: 'Watch it work in 60 seconds, no signup — see what your client sees the moment your technician is on the way.' })
  return (
    <div style={{ background: '#080c16', minHeight: '100vh', color: '#fff' }}>
      <SiteNav />

      <div style={{ maxWidth: 720, margin: '0 auto', textAlign: 'center', padding: '88px 24px 36px' }}>
        <Eyebrow color="#1D9E75">Live, interactive demo</Eyebrow>
        <h1 style={{ fontSize: 'clamp(40px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', margin: '0 0 20px', textWrap: 'balance' }}>
          Watch it work.<br />60 seconds, no signup.
        </h1>
        <p style={{ fontSize: 19, color: '#9aa4bc', margin: '0 auto 10px', lineHeight: 1.6, maxWidth: 520 }}>
          This is what your client sees the moment your technician is on the way.
        </p>
        <p style={{ fontSize: 13, color: '#5c6684', margin: 0 }}>
          Sample demonstration with simulated data — not a real job, technician, or customer.
        </p>
      </div>

      <div style={{ maxWidth: 360, margin: '0 auto 24px', padding: '0 24px' }}>
        <PhoneMockup />
      </div>

      <div style={{ maxWidth: 680, margin: '140px auto 0', padding: '0 24px', textAlign: 'center' }}>
        <Eyebrow color="#1D9E75">Whole-fleet optimizer</Eyebrow>
        <h2 style={{ fontSize: 'clamp(28px, 4vw, 38px)', fontWeight: 800, letterSpacing: '-0.015em', margin: '0 0 14px', textWrap: 'balance' }}>
          Now watch it plan a whole team's day.
        </h2>
        <p style={{ fontSize: 16, color: '#9aa4bc', margin: '0 auto 32px', lineHeight: 1.6, maxWidth: 480 }}>
          Minerva's whole-fleet optimizer, running for real against a sample fleet below — not a video, not a mockup.
        </p>
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto 24px', padding: '0 24px' }}>
        <FleetOptimizerDemo />
      </div>

      <div style={{ maxWidth: 680, margin: '64px auto 100px', padding: '0 24px', textAlign: 'center' }}>
        <Link to="/start" style={{ display: 'inline-block', background: '#1D9E75', color: '#06130e', textDecoration: 'none', padding: '17px 40px', borderRadius: 10, fontSize: 16, fontWeight: 700, marginRight: 12 }}>
          Start your free 14-day trial
        </Link>
        <Link to="/pricing" style={{ display: 'inline-block', background: 'transparent', color: '#fff', textDecoration: 'none', padding: '17px 40px', borderRadius: 10, fontSize: 16, fontWeight: 700, border: '1px solid #262f44' }}>
          See pricing
        </Link>
      </div>

      <SiteFooter />

      <style>{`
        @keyframes minerva-fade-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes minerva-pulse-ring {
          0%   { transform: translate(-50%, -50%) scale(0.6); opacity: 0.5; }
          100% { transform: translate(-50%, -50%) scale(2.6); opacity: 0; }
        }
        @keyframes minerva-dot-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        .minerva-live-pulse {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 14px;
          height: 14px;
          border-radius: 99px;
          background: #1D9E75;
          animation: minerva-pulse-ring 2s ease-out infinite;
        }
        .minerva-sms-1 { animation: minerva-fade-in 0.4s ease-out 0.6s both; }
        .minerva-sms-2 { animation: minerva-fade-in 0.4s ease-out 3.2s both; }
        .minerva-sms-3 { animation: minerva-fade-in 0.4s ease-out 5.8s both; }
      `}</style>
    </div>
  )
}

function Eyebrow({ color, children }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8089a6', fontWeight: 600, marginBottom: 18 }}>
      <span style={{ width: 6, height: 6, borderRadius: 99, background: color, display: 'inline-block' }} />
      {children}
    </div>
  )
}

function PhoneMockup() {
  return (
    <div style={{ position: 'relative' }}>
      <div style={{
        position: 'absolute', left: '14%', right: '14%', bottom: -14, height: 26,
        background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.5), transparent 72%)',
      }} />

      {/* Side buttons, purely cosmetic — part of reading as a real device */}
      <div style={{ position: 'absolute', left: -2, top: 92, width: 3, height: 50, background: '#1c2333', borderRadius: 2 }} />
      <div style={{ position: 'absolute', right: -2, top: 130, width: 3, height: 78, background: '#1c2333', borderRadius: 2 }} />

      <div style={{
        position: 'relative', background: 'linear-gradient(160deg, #1b2335 0%, #0c111e 100%)',
        border: '1px solid #262f44', borderRadius: 40, padding: 7,
        boxShadow: '0 30px 60px -20px rgba(0,0,0,0.6), 0 2px 0 rgba(255,255,255,0.04) inset',
      }}>
        <div style={{ position: 'relative', background: '#06090f', borderRadius: 34, overflow: 'hidden' }}>

          {/* Status bar + dynamic island */}
          <div style={{ position: 'relative', height: 30, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>9:41</span>
            <div style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)', width: 64, height: 16, borderRadius: 99, background: '#000' }} />
            <span style={{ fontSize: 11, color: '#9aa4bc' }}>●●●</span>
          </div>

          {/* Map — hairline grid + one glowing route, not a toy town (see MapScene.jsx) */}
          <div style={{ position: 'relative', aspectRatio: '170 / 110', margin: '0 10px', borderRadius: 16, overflow: 'hidden' }}>
            <PhoneMapBackdrop />

            <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
              <defs>
                <linearGradient id="route-grad" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#2D5FA8" />
                  <stop offset="100%" stopColor="#1D9E75" />
                </linearGradient>
                <RouteGlowFilter id="route-glow-phone" />
              </defs>
              <path d="M10,64 C 24,52 34,42 38,40 C 50,46 55,51 60,56 C 68,46 74,36 78,31 C 82,26 86,23 88,16"
                stroke="url(#route-grad)" strokeWidth="1.4" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke"
                filter="url(#route-glow-phone)" />
            </svg>

            <div style={{ position: 'absolute', right: '8%', top: '11%', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <PinIcon size={18} style={{ color: '#fff', filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.6))' }} />
              <span style={{ marginTop: -2, fontSize: 9.5, fontWeight: 600, color: '#dfe5f5', background: 'rgba(6,9,15,0.8)', padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                Sarah's workshop
              </span>
            </div>

            <div style={{ position: 'absolute', left: '10%', top: '63%', transform: 'translate(-50%, -50%)', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span style={{ position: 'relative' }}>
                <span className="minerva-live-pulse" />
                <span style={{ position: 'relative', display: 'block', width: 11, height: 11, borderRadius: 99, background: '#1D9E75', border: '2px solid #06090f' }} />
              </span>
              <span style={{ marginTop: 3, fontSize: 9.5, fontWeight: 600, color: '#dfe5f5', background: 'rgba(6,9,15,0.8)', padding: '1px 6px', borderRadius: 5, whiteSpace: 'nowrap' }}>
                Dave
              </span>
            </div>

            <MapToolbar compact corner="bottom-right" />

            <div style={{ position: 'absolute', bottom: 8, left: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(6,9,15,0.75)', backdropFilter: 'blur(6px)', padding: '5px 9px', borderRadius: 7, fontSize: 10.5, color: '#9aa4bc', fontWeight: 500 }}>
              <span style={{ width: 5, height: 5, borderRadius: 99, background: '#1D9E75', display: 'inline-block', animation: 'minerva-dot-pulse 1.6s ease-in-out infinite' }} />
              Live · sample data
            </div>
          </div>

          {/* SMS thread */}
          <div style={{ padding: '16px 14px 20px' }}>
            <div className="minerva-sms-1" style={{ background: '#1D9E75', color: '#06130e', padding: '10px 13px', borderRadius: '14px 14px 14px 4px', fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, marginBottom: 7, maxWidth: '88%' }}>
              Hi Sarah, this is Minerva Plumbing — your technician Dave is on the way. Track him live: minerva.link/j8x2
            </div>
            <div className="minerva-sms-2" style={{ background: '#1D9E75', color: '#06130e', padding: '10px 13px', borderRadius: '14px 14px 14px 4px', fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, marginBottom: 7, maxWidth: '88%' }}>
              Dave is approximately 4 minutes away.
            </div>
            <div className="minerva-sms-3" style={{ background: '#1D9E75', color: '#06130e', padding: '10px 13px', borderRadius: '14px 14px 14px 4px', fontSize: 12.5, fontWeight: 500, lineHeight: 1.45, maxWidth: '88%' }}>
              Dave has arrived. Job completed at 2:41pm — thank you for choosing us.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
