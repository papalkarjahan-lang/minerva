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

// Found 2026-10-18: this 15% figure is specifically a route-optimization
// benchmark (see index.ts header — "fleet telematics + route optimization
// typically cuts fuel spend by...") but was being applied to EVERY
// tradeType with no branching at all, including 'industrial' — which has
// no route-optimization feature (optimize-fleet-day/optimize-daily-route
// are both trade-only, see minerva_efficiency_pivot memory) and a
// fundamentally different fuel-usage pattern (equipment travels to a site
// and stays for days, not many short point-to-point daily jobs). An
// industrial prospect was being shown a specific, quantified dollar
// savings figure with no real mechanism behind it for their sector — the
// same "sold vs delivered" bug class found repeatedly elsewhere in this
// project, here on the actual closing document for big-account deals.
// Deliberately not substituting a different industrial-specific savings
// number — no cited, real benchmark exists for one (asset-telemetry/
// safety-compliance value doesn't have a published "cuts cost by X%"
// figure the way route optimization does), and this file's whole premise
// is "real, cited... not invented figures." Industrial proposals simply
// don't show a savings claim; ProposalView.jsx's disclaimer already
// correctly lists what IS real for them instead.
export function shouldComputeFuelSavings(tradeType: string | null | undefined): boolean {
  return tradeType?.toLowerCase() !== 'industrial'
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
