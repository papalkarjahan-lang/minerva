// Pure logic extracted from generate-roi-proposal/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.
//
// Numbers used below are the real, cited industry benchmarks researched
// for BIG_CONTRACTS_PLAYBOOK.md, not invented figures — see index.ts header
// comment for the full rationale.

export const CONSERVATIVE_FUEL_SAVINGS_RATE = 0.15
export const ESTIMATED_FUEL_SPEND_PER_VEHICLE_MONTHLY = 1200
export const MINERVA_PER_TECH_MONTHLY_ESTIMATE = 89 // mid-tier estimate for a bulk/negotiated multi-tech deal

// A caller-provided real fuel spend always overrides the per-vehicle
// estimate — only falls back to the estimate when none is given (or a
// non-positive value is given, which isn't a real number).
export function computeMonthlyFuelSpend(fleetSize: number, avgMonthlyFuelSpend?: number | null): number {
  if (avgMonthlyFuelSpend && avgMonthlyFuelSpend > 0) return avgMonthlyFuelSpend
  return fleetSize * ESTIMATED_FUEL_SPEND_PER_VEHICLE_MONTHLY
}

export function computeFuelSavings(monthlyFuelSpend: number): { monthly: number; annual: number } {
  const monthly = Math.round(monthlyFuelSpend * CONSERVATIVE_FUEL_SAVINGS_RATE)
  return { monthly, annual: monthly * 12 }
}

export function computeMinervaMonthlyCost(fleetSize: number): number {
  return Math.round(fleetSize * MINERVA_PER_TECH_MONTHLY_ESTIMATE)
}

// A proposal being generated only advances the big-account pipeline stage
// if it's still at an early stage — never backward past negotiating/closed,
// so this can't accidentally undo manual stage-tracking done later.
const EARLY_STAGES = ['researching', 'contacted', 'discovery_call']
export function isEligibleForProposalStageAdvance(currentStage: string | null | undefined): boolean {
  return !!currentStage && EARLY_STAGES.includes(currentStage)
}
