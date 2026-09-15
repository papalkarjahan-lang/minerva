import { describe, it, expect, vi } from 'vitest'
import { spotlightMove, magneticMove, magneticLeave, tiltMove, tiltLeave, cardMove, cardLeave } from './interactions'

// Builds a fake mousemove/mouseleave event whose currentTarget behaves enough
// like a real DOM element for these pure style-mutating helpers: a
// getBoundingClientRect stub plus a real style object so property writes are
// observable, matching how these are actually called from onMouseMove/
// onMouseLeave in the marketing pages.
function fakeEvent({ clientX = 50, clientY = 50, rect = { left: 0, top: 0, width: 100, height: 100 } } = {}) {
  return {
    clientX,
    clientY,
    currentTarget: {
      getBoundingClientRect: () => rect,
      style: { setProperty: vi.fn(), transform: '' },
    },
  }
}

describe('spotlightMove', () => {
  it('sets --mx/--my as cursor-position percentages within the element', () => {
    const e = fakeEvent({ clientX: 25, clientY: 75, rect: { left: 0, top: 0, width: 100, height: 100 } })
    spotlightMove(e)
    expect(e.currentTarget.style.setProperty).toHaveBeenCalledWith('--mx', '25%')
    expect(e.currentTarget.style.setProperty).toHaveBeenCalledWith('--my', '75%')
  })

  it('accounts for the element\'s offset, not just page coordinates', () => {
    const e = fakeEvent({ clientX: 60, clientY: 60, rect: { left: 50, top: 50, width: 100, height: 100 } })
    spotlightMove(e)
    expect(e.currentTarget.style.setProperty).toHaveBeenCalledWith('--mx', '10%')
    expect(e.currentTarget.style.setProperty).toHaveBeenCalledWith('--my', '10%')
  })
})

describe('magneticMove / magneticLeave', () => {
  it('nudges toward the cursor relative to the element center', () => {
    const e = fakeEvent({ clientX: 75, clientY: 50, rect: { left: 0, top: 0, width: 100, height: 100 } })
    magneticMove(e)
    // center is (50,50); cursor offset (25,0) * 0.25 = (6.25, 0), y gets an extra -2 bias
    expect(e.currentTarget.style.transform).toBe('translate(6.25px, -2px)')
  })

  it('snaps back to no transform on leave', () => {
    const e = fakeEvent()
    e.currentTarget.style.transform = 'translate(10px, 10px)'
    magneticLeave(e)
    expect(e.currentTarget.style.transform).toBe('')
  })
})

describe('tiltMove / tiltLeave', () => {
  it('applies zero rotation when the cursor is at dead center', () => {
    const e = fakeEvent({ clientX: 50, clientY: 50, rect: { left: 0, top: 0, width: 100, height: 100 } })
    tiltMove(e)
    expect(e.currentTarget.style.transform).toBe('perspective(700px) rotateX(0deg) rotateY(0deg) translateY(-4px)')
  })

  it('tilts in opposite directions for opposite corners', () => {
    const topLeft = fakeEvent({ clientX: 0, clientY: 0, rect: { left: 0, top: 0, width: 100, height: 100 } })
    const bottomRight = fakeEvent({ clientX: 100, clientY: 100, rect: { left: 0, top: 0, width: 100, height: 100 } })
    tiltMove(topLeft)
    tiltMove(bottomRight)
    expect(topLeft.currentTarget.style.transform).not.toBe(bottomRight.currentTarget.style.transform)
  })

  it('resets transform on leave', () => {
    const e = fakeEvent()
    e.currentTarget.style.transform = 'perspective(700px) rotateX(5deg)'
    tiltLeave(e)
    expect(e.currentTarget.style.transform).toBe('')
  })
})

describe('cardMove / cardLeave', () => {
  it('applies both the spotlight CSS vars and the tilt transform in one call', () => {
    const e = fakeEvent({ clientX: 75, clientY: 25, rect: { left: 0, top: 0, width: 100, height: 100 } })
    cardMove(e)
    expect(e.currentTarget.style.setProperty).toHaveBeenCalledWith('--mx', '75%')
    expect(e.currentTarget.style.setProperty).toHaveBeenCalledWith('--my', '25%')
    expect(e.currentTarget.style.transform).toContain('perspective(700px)')
  })

  it('is the same function as tiltLeave (only the tilt needs resetting on leave)', () => {
    expect(cardLeave).toBe(tiltLeave)
  })
})
