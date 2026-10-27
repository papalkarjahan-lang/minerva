import { describe, it, expect } from 'vitest'
import { isScheduleDue } from './logic'

describe('isScheduleDue', () => {
  const now = new Date('2026-10-27T00:00:00.000Z')

  it('meter: never-completed measures from zero, not due before the first interval', () => {
    const schedule = { trigger_type: 'meter', interval_hours: 250, interval_days: null, last_completed_at: null, last_completed_hours: null }
    expect(isScheduleDue(schedule, 10, now)).toBe(false)
  })

  it('meter: never-completed becomes due once engine hours alone cross the interval', () => {
    const schedule = { trigger_type: 'meter', interval_hours: 250, interval_days: null, last_completed_at: null, last_completed_hours: null }
    expect(isScheduleDue(schedule, 300, now)).toBe(true)
  })

  it('is due immediately when never completed (calendar)', () => {
    const schedule = { trigger_type: 'calendar', interval_hours: null, interval_days: 90, last_completed_at: null, last_completed_hours: null }
    expect(isScheduleDue(schedule, null, now)).toBe(true)
  })

  it('meter: not due below the interval', () => {
    const schedule = { trigger_type: 'meter', interval_hours: 250, interval_days: null, last_completed_at: '2026-10-01T00:00:00.000Z', last_completed_hours: 1000 }
    expect(isScheduleDue(schedule, 1200, now)).toBe(false)
  })

  it('meter: due once the interval is crossed', () => {
    const schedule = { trigger_type: 'meter', interval_hours: 250, interval_days: null, last_completed_at: '2026-10-01T00:00:00.000Z', last_completed_hours: 1000 }
    expect(isScheduleDue(schedule, 1251, now)).toBe(true)
  })

  it('meter: exactly at the interval counts as due', () => {
    const schedule = { trigger_type: 'meter', interval_hours: 250, interval_days: null, last_completed_at: '2026-10-01T00:00:00.000Z', last_completed_hours: 1000 }
    expect(isScheduleDue(schedule, 1250, now)).toBe(true)
  })

  it('meter: missing interval_hours never fires (misconfigured schedule, not a crash)', () => {
    const schedule = { trigger_type: 'meter', interval_hours: null, interval_days: null, last_completed_at: '2026-10-01T00:00:00.000Z', last_completed_hours: 1000 }
    expect(isScheduleDue(schedule, 999999, now)).toBe(false)
  })

  it('calendar: not due before interval_days has elapsed', () => {
    const schedule = { trigger_type: 'calendar', interval_hours: null, interval_days: 90, last_completed_at: '2026-10-01T00:00:00.000Z', last_completed_hours: null }
    expect(isScheduleDue(schedule, null, now)).toBe(false)
  })

  it('calendar: due once interval_days has elapsed', () => {
    const schedule = { trigger_type: 'calendar', interval_hours: null, interval_days: 10, last_completed_at: '2026-10-01T00:00:00.000Z', last_completed_hours: null }
    expect(isScheduleDue(schedule, null, now)).toBe(true)
  })

  it('calendar: missing interval_days never fires', () => {
    const schedule = { trigger_type: 'calendar', interval_hours: null, interval_days: null, last_completed_at: '2026-10-01T00:00:00.000Z', last_completed_hours: null }
    expect(isScheduleDue(schedule, null, now)).toBe(false)
  })
})
