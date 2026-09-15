import { useEffect, useRef, useState } from 'react'

// One-shot scroll reveal: fires the first time the ref'd element crosses
// into view, then disconnects (doesn't re-trigger on scroll-back).
export function useReveal() {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setShown(true); obs.disconnect() }
    }, { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, shown]
}

// Wrapper component form of useReveal, for the common case of just fading
// a block of content up into place.
export function Reveal({ children, style, className = '' }) {
  const [ref, shown] = useReveal()
  return (
    <div ref={ref} className={`lp-reveal ${shown ? 'lp-in' : ''} ${className}`} style={style}>
      {children}
    </div>
  )
}
