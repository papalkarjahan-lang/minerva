// Shared, lightweight DOM-driven interaction helpers used across the public
// marketing pages (LandingPage, Features, Enterprise, About). Pure vanilla
// JS mutating style/CSS vars directly on the event target — no React state,
// so these never trigger a re-render on mousemove.

// Cursor-reactive radial glow ("spotlight card" trick, seen on Mapbox's
// product cards). Pair with a CSS rule using var(--mx)/var(--my).
export function spotlightMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`)
  e.currentTarget.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`)
}

// Magnetic buttons — nudge toward the cursor on hover, snap back on leave.
export function magneticMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const mx = (e.clientX - r.left - r.width / 2) * 0.25
  const my = (e.clientY - r.top - r.height / 2) * 0.25
  e.currentTarget.style.transform = `translate(${mx}px, ${my - 2}px)`
}
export function magneticLeave(e) { e.currentTarget.style.transform = '' }

// Subtle 3D tilt on hover for feature/pricing/capability cards.
export function tiltMove(e) {
  const r = e.currentTarget.getBoundingClientRect()
  const px = (e.clientX - r.left) / r.width - 0.5
  const py = (e.clientY - r.top) / r.height - 0.5
  e.currentTarget.style.transform = `perspective(700px) rotateX(${py * -6}deg) rotateY(${px * 6}deg) translateY(-4px)`
}
export function tiltLeave(e) { e.currentTarget.style.transform = '' }

// Combined handler for cards that want both the spotlight glow and the tilt.
export function cardMove(e) { spotlightMove(e); tiltMove(e) }
export const cardLeave = tiltLeave
