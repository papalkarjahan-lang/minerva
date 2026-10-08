import { describe, it, expect } from 'vitest'
import { isTierAvailableForSector } from './tierEligibility'

describe('isTierAvailableForSector', () => {
  it("rejects pro for industrial — none of Pro's 6 marketed features exist for that sector", () => {
    expect(isTierAvailableForSector('pro', 'industrial')).toBe(false)
  })

  it('allows pro for trade', () => {
    expect(isTierAvailableForSector('pro', 'trade')).toBe(true)
  })

  it('allows starter and standard for either sector', () => {
    expect(isTierAvailableForSector('starter', 'industrial')).toBe(true)
    expect(isTierAvailableForSector('standard', 'industrial')).toBe(true)
    expect(isTierAvailableForSector('starter', 'trade')).toBe(true)
    expect(isTierAvailableForSector('standard', 'trade')).toBe(true)
  })

  it('allows an unrecognised tier through — neither call site treats that as a real Pro charge', () => {
    expect(isTierAvailableForSector('not_a_real_tier', 'industrial')).toBe(true)
  })

  it('allows pro when sector is null/undefined — only an explicit industrial match is rejected', () => {
    expect(isTierAvailableForSector('pro', null)).toBe(true)
    expect(isTierAvailableForSector('pro', undefined)).toBe(true)
  })
})
