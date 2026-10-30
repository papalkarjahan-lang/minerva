// Shared "map" visual used behind both the phone mockup's live-tracking
// view (Demo.jsx) and the fleet optimizer's route map
// (FleetOptimizerDemo.jsx).
//
// Went through two passes before this one: first a literal isometric
// toy-town (buildings, dual-accent chrome) that read as cluttered and
// amateurish; then an almost-bare hairline grid that was clean but read
// as an abstract line chart rather than a map. This version keeps the
// first version's restraint — dark canvas, one accent, a glowing route —
// but adds the detail that actually makes a map read as a map: named
// streets in a real hierarchy (major roads brighter and labeled, minor
// streets quiet), a park and a waterline, and a faint neighborhood
// watermark the way Google/Apple Maps show an area name at city zoom.
// Still hand-built SVG, no Mapbox dependency — VITE_MAPBOX_TOKEN is
// still an unset placeholder (see Demo.jsx).

function Grid({ w, h, step, color = 'rgba(255,255,255,0.05)' }) {
  const lines = []
  for (let x = 0; x <= w; x += step) lines.push(<line key={`v${x}`} x1={x} y1={0} x2={x} y2={h} />)
  for (let y = 0; y <= h; y += step) lines.push(<line key={`h${y}`} x1={0} y1={y} x2={w} y2={y} />)
  return <g stroke={color} strokeWidth="0.5">{lines}</g>
}

// A named major road — brighter than the grid, with its name set in the
// small caps/letter-spaced style every real map renders street labels
// in. `rotate` lets a vertical road's label read bottom-to-top.
function MajorRoad({ d, label, labelX, labelY, rotate = 0, size = 3.4 }) {
  return (
    <g>
      <path d={d} stroke="rgba(255,255,255,0.16)" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      {label && (
        <text
          x={labelX} y={labelY}
          transform={rotate ? `rotate(${rotate} ${labelX} ${labelY})` : undefined}
          fontSize={size} fontWeight="600" letterSpacing="0.5"
          fill="rgba(222,229,245,0.5)"
        >{label}</text>
      )}
    </g>
  )
}

function ParkArea({ d, labelX, labelY, label }) {
  return (
    <g>
      <path d={d} fill="rgba(29,158,117,0.1)" stroke="rgba(29,158,117,0.18)" strokeWidth="0.5" />
      <text x={labelX} y={labelY} fontSize="3.1" fontWeight="600" letterSpacing="0.4" fill="rgba(170,210,195,0.55)">{label}</text>
    </g>
  )
}

function WaterArea({ d, labelX, labelY, label }) {
  return (
    <g>
      <path d={d} fill="rgba(45,95,168,0.16)" stroke="rgba(45,95,168,0.22)" strokeWidth="0.5" />
      <text x={labelX} y={labelY} fontSize="3.1" fontWeight="600" letterSpacing="0.4" fill="rgba(173,198,230,0.55)">{label}</text>
    </g>
  )
}

// Large, near-invisible area name — purely atmospheric, the same trick
// Google/Apple Maps use to show a suburb name underneath everything else.
function NeighborhoodLabel({ x, y, size, children }) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight="800" letterSpacing="0.6" fill="rgba(255,255,255,0.045)">
      {children}
    </text>
  )
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
      <NeighborhoodLabel x={6} y={102} size={15}>RIVERDALE</NeighborhoodLabel>
      <Grid w={170} h={110} step={17} />
      <ParkArea d="M2,2 C16,-1 28,5 26,16 C24,26 10,29 4,21 C-1,14 -6,5 2,2 Z" labelX={2} labelY={24} label="FAIRVIEW PARK" />
      <MajorRoad d="M0,38 H170" label="MAIN ST" labelX={6} labelY={35.5} />
      <MajorRoad d="M64,0 V110" label="5TH AVE" labelX={61.5} labelY={30} rotate={-90} />
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
      <NeighborhoodLabel x={8} y={24}  size={19}>DOWNTOWN</NeighborhoodLabel>
      <Grid w={220} h={130} step={18.3} />
      <WaterArea d="M198,0 L220,0 L220,130 L204,130 C210,98 196,66 204,36 C209,16 203,6 198,0 Z" labelX={199} labelY={116} label="HARBOR" />
      <ParkArea d="M0,98 C -2,112 6,126 20,128 C34,130 42,118 36,106 C30,94 4,88 0,98 Z" labelX={3} labelY={95} label="FAIRVIEW PARK" />
      <MajorRoad d="M0,43 H198" label="MAIN ST" labelX={6} labelY={40.5} />
      <MajorRoad d="M0,87 H198" label="2ND AVE" labelX={6} labelY={84.5} />
      <MajorRoad d="M110,0 V130" label="5TH AVE" labelX={107.5} labelY={30} rotate={-90} />
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
