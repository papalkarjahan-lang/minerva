// Small, hand-drawn line icons used in place of platform emoji (🏠 🚐 ⚡ ✓)
// on the public Demo page. Emoji render as whatever cartoon/sticker style
// the visitor's OS ships (Apple's glossy 3D icons, Windows' flatter set,
// etc.) — fine in a chat bubble, but it read as a toy next to a dark,
// precise product UI when a prospect is deciding whether to trust the
// numbers on the page next to it. These are plain stroke/fill SVG, sized
// via `size`, colored via `currentColor` (set color on the parent), so they
// stay crisp and on-brand on every device instead.

export function PinIcon({ size = 18, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path
        d="M12 2C7.8 2 4.5 5.3 4.5 9.4c0 5.6 6.1 11.4 7.1 12.3.2.2.6.2.8 0 1-.9 7.1-6.7 7.1-12.3C19.5 5.3 16.2 2 12 2z"
        fill="currentColor"
      />
      <circle cx="12" cy="9.5" r="2.6" fill="#0a0f1d" />
    </svg>
  )
}

export function VanIcon({ size = 16, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path
        d="M2.5 15V8.8C2.5 8 3.1 7.4 3.9 7.4h10.8c.5 0 1 .3 1.3.7l2.4 3.4h1.6c.8 0 1.5.7 1.5 1.5V15"
        stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      />
      <path d="M2.5 15h19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="7" cy="17.3" r="1.9" fill="#0a0f1d" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="17" cy="17.3" r="1.9" fill="#0a0f1d" stroke="currentColor" strokeWidth="1.4" />
      <path d="M14.3 7.4V11.5H19.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function BoltIcon({ size = 14, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M13 2 4 14h6.5L11 22l9-13h-6.5L13 2z" fill="currentColor" />
    </svg>
  )
}

export function CheckCircleIcon({ size = 14, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M7.5 12.3 10.4 15.3 16.5 9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ArrowRightIcon({ size = 12, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M4 12h16M14 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Real iOS-style status bar glyphs, replacing a literal "●●●" placeholder
// that was the single most obvious "this is a mockup, not a photo"
// tell on the phone demo (flagged directly: "looks childish").
export function SignalIcon({ size = 13, style }) {
  return (
    <svg width={size} height={size * 0.72} viewBox="0 0 17 12" fill="none" style={style}>
      <rect x="0" y="7" width="3" height="5" rx="0.6" fill="currentColor" />
      <rect x="4.5" y="5" width="3" height="7" rx="0.6" fill="currentColor" />
      <rect x="9" y="3" width="3" height="9" rx="0.6" fill="currentColor" />
      <rect x="13.5" y="0" width="3" height="12" rx="0.6" fill="currentColor" />
    </svg>
  )
}

export function WifiIcon({ size = 14, style }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 16 12" fill="none" style={style}>
      <path d="M1 4.2C5.8-0.4 10.2-0.4 15 4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <path d="M3.4 7C6.5 4 9.5 4 12.6 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" />
      <circle cx="8" cy="10.3" r="1.3" fill="currentColor" />
    </svg>
  )
}

export function BatteryIcon({ size = 23, style, level = 0.85 }) {
  const innerW = 15.5 * Math.max(0, Math.min(1, level))
  return (
    <svg width={size} height={size * 0.48} viewBox="0 0 25 12" fill="none" style={style}>
      <rect x="0.75" y="0.75" width="19.5" height="10.5" rx="2.6" stroke="currentColor" strokeOpacity="0.4" strokeWidth="1" />
      <rect x="2.25" y="2.25" width={innerW} height="7.5" rx="1.4" fill="currentColor" />
      <path d="M21.5 4v4c.9-.35 1.5-1.2 1.5-2s-.6-1.65-1.5-2z" fill="currentColor" fillOpacity="0.4" />
    </svg>
  )
}

// Used on the /demo "it keeps running after the van leaves" timeline —
// invoice, review and win-back steps that happen after dispatch, not during it.
export function ReceiptIcon({ size = 16, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path
        d="M6 2.5h12a.5.5 0 0 1 .5.5v18.3c0 .4-.45.63-.78.4l-1.47-1.02a.5.5 0 0 0-.58 0l-1.42 1a.5.5 0 0 1-.58 0l-1.42-1a.5.5 0 0 0-.58 0l-1.42 1a.5.5 0 0 1-.58 0l-1.42-1a.5.5 0 0 0-.58 0l-1.42 1a.5.5 0 0 1-.58 0L5.78 21.3a.5.5 0 0 1-.78-.4V3a.5.5 0 0 1 .5-.5z"
        stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
      />
      <path d="M8.3 8h7.4M8.3 12h7.4M8.3 16h4.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

export function StarIcon({ size = 14, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={style}>
      <path d="M12 2.5l2.9 6.26 6.6.63-5 4.66 1.4 6.95L12 17.77l-5.9 3.23 1.4-6.95-5-4.66 6.6-.63L12 2.5z" fill="currentColor" />
    </svg>
  )
}
