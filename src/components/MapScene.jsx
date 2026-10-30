// Shared "map" visual used behind both the phone mockup's live-tracking
// view (Demo.jsx) and the fleet optimizer's route map
// (FleetOptimizerDemo.jsx).
//
// Rebuilt after the first pass (a literal isometric toy-town with
// extruded buildings) read as cluttered and amateurish rather than
// credible. Real map UIs that people trust — Uber, Google/Apple Maps at
// city zoom, every dispatch dashboard — are mostly empty: a quiet dark
// canvas, a handful of thin hairline streets, and ONE confident, glowing
// route. The route and the pins are the actual content; the backdrop's
// only job is to not compete with them. No Mapbox dependency —
// VITE_MAPBOX_TOKEN is still an unset placeholder (see Demo.jsx) — this
// stays hand-built SVG, deliberately restrained instead of elaborate.

function Grid({ w, h, step, color = 'rgba(255,255,255,0.055)' }) {
  const lines = []
  for (let x = 0; x <= w; x += step) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={h} />)
  for (let y = 0; y <= h; y += step) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={w} y2={y} />)
  return <g stroke={color} strokeWidth="0.6">{lines}</g>
}

// A couple of streets rendered just slightly brighter than the grid, so
// the canvas reads as "a map" rather than "graph paper" without
// resorting to a busy full road network.
function FeatureStreets({ d }) {
  return d.map((path, i) => (
    <path key={i} d={path} stroke="rgba(255,255,255,0.1)" strokeWidth="1" fill="none" strokeLinecap="round" />
  ))
}

export function PhoneMapBackdrop() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 170 110" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <radialGradient id="phone-wash" cx="30%" cy="20%" r="75%">
          <stop offset="0%" stopColor="#152036" />
          <stop offset="100%" stopColor="#0a0f1d" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="170" height="110" fill="url(#phone-wash)" />
      <Grid w={170} h={110} step={17} />
      <FeatureStreets d={['M0,38 H170', 'M64,0 V110']} />
    </svg>
  )
}

export function FleetMapBackdrop() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 220 130" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <radialGradient id="fleet-wash" cx="28%" cy="18%" r="80%">
          <stop offset="0%" stopColor="#16223c" />
          <stop offset="100%" stopColor="#0a0f1d" />
        </radialGradient>
      </defs>
      <rect x="0" y="0" width="220" height="130" fill="url(#fleet-wash)" />
      <Grid w={220} h={130} step={18.3} />
      <FeatureStreets d={['M0,43 H220', 'M0,87 H220', 'M73,0 V130', 'M147,0 V130']} />
    </svg>
  )
}

// A single, understated toolbar — the one piece of "app chrome" real map
// UIs always have, kept to two controls so it reads as authentic without
// becoming a second focal point.
export function MapToolbar({ compact, corner = 'top-right' }) {
  const s = compact ? 22 : 26
  const pos = corner === 'bottom-right'
    ? { bottom: compact ? 8 : 12, right: compact ? 8 : 12 }
    : { top: compact ? 8 : 12, right: compact ? 8 : 12 }
  return (
    <div style={{
      position: 'absolute', ...pos, zIndex: 3,
      display: 'flex', flexDirection: 'column', borderRadius: 9, overflow: 'hidden',
      background: 'rgba(10,15,29,0.72)', backdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    }}>
      {['+', '–'].map((sym, i) => (
        <span key={sym} style={{
          width: s, height: s, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'rgba(255,255,255,0.75)', fontSize: compact ? 12 : 13, fontWeight: 600,
          borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
        }}>{sym}</span>
      ))}
    </div>
  )
}

// Soft outer glow behind a route path — the one piece of "premium" flair
// this scene uses, applied to the single element that deserves emphasis.
export function RouteGlowFilter({ id }) {
  return (
    <filter id={id} x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="1.6" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  )
}
