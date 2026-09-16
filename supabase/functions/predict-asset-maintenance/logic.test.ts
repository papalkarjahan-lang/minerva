import { describe, it, expect } from 'vitest'
import { projectMaintenance } from './logic'

describe('projectMaintenance', () => {
  const first = { engine_hours: 100, created_at: '2026-09-01T00:00:00.000Z' }

  it('returns null when the pings are not chronologically increasing (elapsed <= 0)', () => {
    const last = { engine_hours: 120, created_at: '2026-09-01T00:00:00.000Z' } // same instant
    expect(projectMaintenance(first, last, 120, 0, 250, 7)).toBeNull()
  })

  it('returns null when there is no usage growth (idle or reading error)', () => {
    const last = { engine_hours: 100, created_at: '2026-09-08T00:00:00.000Z' } // 7 days later, same hours
    expect(projectMaintenance(first, last, 100, 0, 250, 7)).toBeNull()
  })

  it('returns null when already past due (reactive check owns that case)', () => {
    // 10h/day usage, due at 250h, already at 260h
    const last = { engine_hours: 260, created_at: '2026-09-08T00:00:00.000Z' } // 7 days, delta 160
    expect(projectMaintenance(first, last, 260, 0, 250, 7)).toBeNull()
  })

  it('returns null when the projected due date is outside the prediction window', () => {
    // 10h/day usage, due at 500h, currently at 100h -> 400h remaining -> 40 days out, window is 7
    const last = { engine_hours: 170, created_at: '2026-09-08T00:00:00.000Z' } // 7 days, delta 70 -> 10h/day
    expect(projectMaintenance(first, last, 170, 0, 500, 7)).toBeNull()
  })

  it('predicts correctly when the due date falls within the window', () => {
    // 10h/day usage (70h over 7 days), due at 250h, currently at 170h -> 80h remaining -> 8 days... adjust to land inside window
    const last = { engine_hours: 240, created_at: '2026-09-08T00:00:00.000Z' } // 7 days, delta 140 -> 20h/day
    // dueAt = 250, hoursRemaining = 250 - 240 = 10, daysUntilDue = 10/20 = 0.5 -> within 7-day window
    const result = projectMaintenance(first, last, 240, 0, 250, 7)
    expect(result).not.toBeNull()
    expect(result!.dailyRate).toBeCloseTo(20, 5)
    expect(result!.daysUntilDue).toBeCloseTo(0.5, 5)
    expect(result!.roundedDays).toBe(1) // Math.max(1, Math.round(0.5))
  })

  it('defaults maintenance interval to 250h when not set', () => {
    const last = { engine_hours: 240, created_at: '2026-09-08T00:00:00.000Z' } // 20h/day
    const result = projectMaintenance(first, last, 240, 0, null, 7)
    // dueAt = 0 + 250 = 250, hoursRemaining = 10, daysUntilDue = 0.5
    expect(result).not.toBeNull()
    expect(result!.daysUntilDue).toBeCloseTo(0.5, 5)
  })
})
