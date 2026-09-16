// Pure linear-projection logic for predict-asset-maintenance, extracted out
// of index.ts so it can be unit-tested with Vitest (edge functions
// themselves can't be imported into a Node test runner). index.ts imports
// this same function, so this file IS the production logic, not a
// reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — this is a
// plain, synchronous, side-effect-free calculation over plain data.

export interface TelemetryPing {
  engine_hours: number | null
  created_at: string
}

export interface MaintenancePrediction {
  dailyRate: number
  daysUntilDue: number
  roundedDays: number
}

// Projects when an asset will cross its maintenance threshold from a simple
// linear usage rate (first vs. last ping in the caller's lookback window).
// Returns null whenever there isn't a meaningful trend to project, or the
// asset isn't due within predictWindowDays — mirroring each of index.ts's
// original `continue` conditions exactly, in the same order.
export function projectMaintenance(
  first: TelemetryPing,
  last: TelemetryPing,
  assetEngineHours: number | null,
  lastMaintenanceAtHours: number | null,
  maintenanceIntervalHours: number | null,
  predictWindowDays: number
): MaintenancePrediction | null {
  const hoursElapsedDays = (new Date(last.created_at).getTime() - new Date(first.created_at).getTime()) / (24 * 60 * 60 * 1000)
  if (hoursElapsedDays <= 0) return null // idle or reading error, no usage trend to project

  const engineHoursDelta = (last.engine_hours || 0) - (first.engine_hours || 0)
  if (engineHoursDelta <= 0) return null // idle or reading error, no usage trend to project

  const dailyRate = engineHoursDelta / hoursElapsedDays
  const dueAt = (lastMaintenanceAtHours || 0) + (maintenanceIntervalHours || 250)
  const hoursRemaining = dueAt - (last.engine_hours || assetEngineHours || 0)
  if (hoursRemaining <= 0) return null // already past due — the reactive check owns this case

  const daysUntilDue = hoursRemaining / dailyRate
  if (daysUntilDue > predictWindowDays) return null // not close enough yet

  return { dailyRate, daysUntilDue, roundedDays: Math.max(1, Math.round(daysUntilDue)) }
}
