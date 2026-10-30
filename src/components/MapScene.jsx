// Shared decorative "basemap" layer used behind both the phone mockup's
// live-tracking view (Demo.jsx) and the fleet optimizer's route map
// (FleetOptimizerDemo.jsx). This is NOT Mapbox or Google Maps — there is
// no tile layer, no API key, no real geodata. VITE_MAPBOX_TOKEN is still
// an unset placeholder (see Demo.jsx's own comment), so a real map
// embed would render broken for every visitor. Instead this is a
// hand-built SVG street scene in the visual language of a dark
// navigation app — road hierarchy, blocks, a park, a waterline, and
// isometric-extruded buildings for depth — close enough to read as "a
// real map" at a glance, while the page text around it keeps the
// standing "sample demonstration with simulated data" label so nothing
// here is ever presented as a real place.
//
// Routes and markers (job dots, technician pins, the live van) stay in
// their own SVG layer on top of this one, in whatever coordinate space
// each caller already uses — this backdrop is purely atmospheric and
// deliberately never required to align with real data points.

const EX = 2.4 // isometric "up" extrusion offset, x — shared by every
const EY = -5 // building so the light/shadow direction reads as one scene

const PALETTES = [
  { roof: '#33497a', wallBottom: '#192646', wallLeft: '#22335a' },
  { roof: '#3c588f', wallBottom: '#1e2f54', wallLeft: '#2b406c' },
  { roof: '#2b3e68', wallBottom: '#141f3a', wallLeft: '#1c2c4c' },
  { roof: '#45628f', wallBottom: '#223457', wallLeft: '#324a76' },
]

function Building({ x, y, w, d, p }) {
  return (
    <g>
      <polygon
        points={`${x},${y + d} ${x + w},${y + d} ${x + w + EX},${y + d + EY} ${x + EX},${y + d + EY}`}
        fill={p.wallBottom}
      />
      <polygon
        points={`${x},${y} ${x},${y + d} ${x + EX},${y + d + EY} ${x + EX},${y + EY}`}
        fill={p.wallLeft}
      />
      <rect x={x + EX} y={y + EY} width={w} height={d} fill={p.roof} />
    </g>
  )
}

function Road({ d, arterial }) {
  return (
    <g>
      <path d={d} stroke={arterial ? '#0c0f18' : '#0a0e1a'} strokeWidth={arterial ? 3.4 : 2} fill="none" strokeLinecap="round" />
      <path d={d} stroke={arterial ? '#d98c3d' : '#2f4470'} strokeWidth={arterial ? 2 : 1} fill="none" strokeLinecap="round" />
    </g>
  )
}

// Small town — used behind the single-technician phone tracking view.
export function PhoneMapBackdrop() {
  const b = [
    [6, 4, 17, 13], [46, 3, 16, 12], [86, 4, 18, 13], [126, 3, 16, 12],
    [6, 41, 16, 14], [48, 39, 18, 15], [92, 41, 16, 13], [132, 39, 18, 15],
    [11, 81, 16, 13], [57, 79, 18, 15], [101, 81, 16, 13],
  ]
  return (
    <svg width="100%" height="100%" viewBox="0 0 170 110" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
      <rect x="0" y="0" width="170" height="110" fill="#111b31" />
      <path d="M140,2 C152,0 164,8 162,20 C160,30 148,32 142,24 C136,18 132,6 140,2 Z" fill="#17301f" />
      <Road d="M0,28 H170" />
      <Road d="M0,66 H170" />
      <Road d="M38,0 V110" />
      <Road d="M78,0 V110" />
      <Road d="M118,0 V110" />
      <Road d="M150,0 V110" arterial={false} />
      <Road d="M-4,104 C50,78 110,38 174,6" arterial />
      {b.map(([x, y, w, d], i) => <Building key={i} x={x} y={y} w={w} d={d} p={PALETTES[i % PALETTES.length]} />)}
    </svg>
  )
}

// Denser downtown grid with a waterline on one edge — used behind the
// whole-fleet optimizer, which needs to read as "a real city" at a
// larger scale with three technicians moving through it.
export function FleetMapBackdrop() {
  const b = [
    [6, 3, 16, 14], [42, 4, 18, 13], [82, 3, 20, 15], [124, 4, 16, 13], [162, 3, 18, 14],
    [6, 32, 16, 16], [42, 34, 16, 14], [82, 33, 18, 15], [124, 34, 15, 14], [162, 32, 18, 16],
    [6, 62, 15, 14], [42, 63, 16, 15], [82, 62, 17, 16], [124, 63, 15, 14],
    [47, 93, 16, 14], [86, 92, 18, 15], [126, 93, 15, 14], [164, 92, 18, 15],
  ]
  return (
    <svg width="100%" height="100%" viewBox="0 0 220 130" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
      <rect x="0" y="0" width="220" height="130" fill="#101a30" />
      <path d="M197,0 L220,0 L220,130 L200,130 C206,100 192,70 200,40 C206,18 200,6 197,0 Z" fill="#0d2535" />
      <path d="M8,96 C2,106 6,119 18,123 C30,127 41,119 39,107 C37,95 16,87 8,96 Z" fill="#17301f" />
      <Road d="M0,25 H197" />
      <Road d="M0,55 H197" />
      <Road d="M0,85 H197" />
      <Road d="M0,115 H190" />
      <Road d="M30,0 V130" />
      <Road d="M70,0 V130" />
      <Road d="M110,0 V130" />
      <Road d="M150,0 V130" />
      <Road d="M190,0 V130" />
      <Road d="M-4,124 C60,96 140,54 224,14" arterial />
      {b.map(([x, y, w, d], i) => <Building key={i} x={x} y={y} w={w} d={d} p={PALETTES[i % PALETTES.length]} />)}
    </svg>
  )
}

// Decorative zoom control, like the one in the corner of any map app —
// static (not wired to anything), there to read as "real map UI" at a
// glance rather than an abstract illustration.
export function MapZoomControl({ compact, corner = 'bottom-right' }) {
  const s = compact ? 20 : 24
  const pos = corner === 'top-right'
    ? { top: (compact ? 8 : 12) + s + (compact ? 14 : 18), right: compact ? 8 : 12 }
    : { bottom: compact ? 8 : 12, right: compact ? 8 : 12 }
  return (
    <div style={{
      position: 'absolute', ...pos, zIndex: 3,
      display: 'flex', flexDirection: 'column', borderRadius: 7, overflow: 'hidden',
      boxShadow: '0 3px 10px rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.08)',
    }}>
      {['+', '–'].map((sym, i) => (
        <span key={sym} style={{
          width: s, height: s, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#141d30', color: '#cfd8e8', fontSize: compact ? 12 : 14, fontWeight: 600,
          borderBottom: i === 0 ? '1px solid rgba(255,255,255,0.08)' : 'none',
        }}>{sym}</span>
      ))}
    </div>
  )
}

export function MapCompass({ compact }) {
  const s = compact ? 22 : 26
  return (
    <div style={{
      position: 'absolute', top: compact ? 8 : 12, right: compact ? 8 : 12, zIndex: 3,
      width: s, height: s, borderRadius: 99, background: '#141d30', border: '1px solid rgba(255,255,255,0.1)',
      boxShadow: '0 3px 10px rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={s * 0.5} height={s * 0.5} viewBox="0 0 24 24">
        <path d="M12 2 L15.5 12 L12 9.8 L8.5 12 Z" fill="#e2573f" />
        <path d="M12 22 L15.5 12 L12 14.2 L8.5 12 Z" fill="#8a93a8" />
      </svg>
    </div>
  )
}
