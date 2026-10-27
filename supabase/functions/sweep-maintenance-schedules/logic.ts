// Pure due/overdue calculation for sweep-maintenance-schedules, extracted
// out of index.ts so it can be unit-tested with Vitest — same split as
// predict-asset-maintenance/logic.ts. Dependency-free on purpose.

export interface MaintenanceSchedule {
  trigger_type: string // 'meter' | 'calendar'
  interval_hours: number | null
  interval_days: number | null
  last_completed_at: string | null
  last_completed_hours: number | null
}

// Returns true when a schedule is due, given the asset's current engine
// hours and the current time. For 'calendar' schedules, never-completed
// means there's no prior date to measure a gap against, so it's due
// immediately. For 'meter' schedules, never-completed instead measures
// from zero (last_completed_hours defaults to 0) — a brand-new asset
// isn't due for its first 250-hour service the moment it's created, only
// once it actually accumulates that many engine hours.
export function isScheduleDue(
  schedule: MaintenanceSchedule,
  currentEngineHours: number | null,
  now: Date
): boolean {
  if (schedule.trigger_type === 'calendar') {
    if (!schedule.last_completed_at) return true
    if (!schedule.interval_days || schedule.interval_days <= 0) return false
    const dueAt = new Date(schedule.last_completed_at).getTime() + schedule.interval_days * 24 * 60 * 60 * 1000
    return now.getTime() >= dueAt
  }

  // 'meter' (default)
  if (!schedule.interval_hours || schedule.interval_hours <= 0) return false
  const hoursSinceService = (currentEngineHours || 0) - (schedule.last_completed_hours || 0)
  return hoursSinceService >= schedule.interval_hours
}
