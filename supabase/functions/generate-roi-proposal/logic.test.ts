import { describe, it, expect } from 'vitest'
import {
  computeMonthlyFuelSpend,
  computeFuelSavings,
  computeMinervaMonthlyCost,
  isEligibleForProposalStageAdvance,
} from './logic'

describe('computeMonthlyFuelSpend', () => {
  it('uses the provided real fuel spend when positive', () => {
    expect(computeMonthlyFuelSpend(10, 5000)).toBe(5000)
  })

  it('estimates from fleet size when no fuel spend is provided', () => {
    expect(computeMonthlyFuelSpend(10)).toBe(12000)
  })

  it('estimates from fleet size when the provided fuel spend is zero or negative', () => {
    expect(computeMonthlyFuelSpend(10, 0)).toBe(12000)
    expect(computeMonthlyFuelSpend(10, -500)).toBe(12000)
  })
})

describe('computeFuelSavings', () => {
  it('computes 15% monthly savings and annualizes it', () => {
    expect(computeFuelSavings(12000)).toEqual({ monthly: 1800, annual: 21600 })
  })

  it('rounds the monthly figure', () => {
    expect(computeFuelSavings(1001)).toEqual({ monthly: 150, annual: 1800 })
  })
})

describe('computeMinervaMonthlyCost', () => {
  it('multiplies fleet size by the per-tech monthly estimate', () => {
    expect(computeMinervaMonthlyCost(10)).toBe(890)
  })

  it('rounds the result', () => {
    expect(computeMinervaMonthlyCost(3)).toBe(267)
  })
})

describe('isEligibleForProposalStageAdvance', () => {
  it('is true for early pipeline stages', () => {
    expect(isEligibleForProposalStageAdvance('researching')).toBe(true)
    expect(isEligibleForProposalStageAdvance('contacted')).toBe(true)
    expect(isEligibleForProposalStageAdvance('discovery_call')).toBe(true)
  })

  it('is false for later stages (never moves stage backward)', () => {
    expect(isEligibleForProposalStageAdvance('proposal_sent')).toBe(false)
    expect(isEligibleForProposalStageAdvance('negotiating')).toBe(false)
    expect(isEligibleForProposalStageAdvance('closed_won')).toBe(false)
  })

  it('is false for null/undefined stage', () => {
    expect(isEligibleForProposalStageAdvance(null)).toBe(false)
    expect(isEligibleForProposalStageAdvance(undefined)).toBe(false)
  })
})
