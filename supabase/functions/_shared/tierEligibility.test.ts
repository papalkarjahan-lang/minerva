import { describe, it, expect } from 'vitest'
import { isTierAvailableForSector, hasStandardAutomation } from './tierEligibility'

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

describe('hasStandardAutomation', () => {
  it('allows standard and pro, for trade sector', () => {
    expect(hasStandardAutomation('standard', 'trade')).toBe(true)
    expect(hasStandardAutomation('pro', 'trade')).toBe(true)
  })

  it('rejects starter, even for trade', () => {
    expect(hasStandardAutomation('starter', 'trade')).toBe(false)
  })

  it('rejects cancelled — a lapsed subscription should not keep paid automation running', () => {
    expect(hasStandardAutomation('cancelled', 'trade')).toBe(false)
  })

  it('rejects null/undefined/unrecognised tier values, failing closed rather than open', () => {
    expect(hasStandardAutomation(null, 'trade')).toBe(false)
    expect(hasStandardAutomation(undefined, 'trade')).toBe(false)
    expect(hasStandardAutomation('not_a_real_tier', 'trade')).toBe(false)
  })

  it('rejects industrial sector even with an otherwise-eligible tier — the exact bug this correction closes', () => {
    // industrial never touches invoices/leads/jobs (the tables every
    // function this gates reads), so Standard/Pro would buy nothing
    // reachable for an industrial business, same bug class as the
    // original Pro/Industrial finding.
    expect(hasStandardAutomation('standard', 'industrial')).toBe(false)
    expect(hasStandardAutomation('pro', 'industrial')).toBe(false)
  })

  it('rejects a null/undefined/unrecognised sector too, failing closed', () => {
    expect(hasStandardAutomation('standard', null)).toBe(false)
    expect(hasStandardAutomation('standard', undefined)).toBe(false)
    expect(hasStandardAutomation('standard', 'not_a_real_sector')).toBe(false)
  })
})
