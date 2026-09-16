import { describe, it, expect } from 'vitest'
import { evaluateFunctionHealth, ERROR_COUNT_THRESHOLD } from './logic'

describe('evaluateFunctionHealth', () => {
  const now = new Date('2026-01-10T00:00:00.000Z').getTime()

  it('is healthy when it ran recently and has no errors', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: new Date(now - 5 * 60 * 1000).toISOString(),
      errorCount: 0,
      lastHealthAlertAt: null,
      cadenceMinutes: 15,
    }, now)
    expect(result.unhealthy).toBe(false)
    expect(result.shouldAlert).toBe(false)
  })

  it('is stale when overdue past the multiplier*cadence threshold', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: new Date(now - 60 * 60 * 1000).toISOString(), // 60 min ago, cadence 15 -> threshold 45min
      errorCount: 0,
      lastHealthAlertAt: null,
      cadenceMinutes: 15,
    }, now)
    expect(result.isStale).toBe(true)
    expect(result.unhealthy).toBe(true)
  })

  it('is not stale within the floor minutes even for a very fast cadence', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: new Date(now - 20 * 60 * 1000).toISOString(), // 20 min ago
      errorCount: 0,
      lastHealthAlertAt: null,
      cadenceMinutes: 5, // 5*3=15min < 30min floor, so threshold is 30min
    }, now)
    expect(result.isStale).toBe(false)
  })

  it('is stale when it has never recorded a run and has a known cadence', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: null,
      errorCount: 0,
      lastHealthAlertAt: null,
      cadenceMinutes: 15,
    }, now)
    expect(result.isStale).toBe(true)
    expect(result.reasons).toEqual(['has never recorded a run'])
  })

  it('skips the staleness check entirely when there is no known cadence', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: null,
      errorCount: 0,
      lastHealthAlertAt: null,
      cadenceMinutes: undefined,
    }, now)
    expect(result.isStale).toBe(false)
    expect(result.unhealthy).toBe(false)
  })

  it('is error-heavy exactly at the threshold', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: new Date(now).toISOString(),
      errorCount: ERROR_COUNT_THRESHOLD,
      lastHealthAlertAt: null,
      cadenceMinutes: 15,
    }, now)
    expect(result.isErrorHeavy).toBe(true)
    expect(result.unhealthy).toBe(true)
  })

  it('is not error-heavy just below the threshold', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: new Date(now).toISOString(),
      errorCount: ERROR_COUNT_THRESHOLD - 1,
      lastHealthAlertAt: null,
      cadenceMinutes: 15,
    }, now)
    expect(result.isErrorHeavy).toBe(false)
  })

  it('does not re-alert for the same unresolved episode (no run since last alert)', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: new Date(now - 60 * 60 * 1000).toISOString(),
      errorCount: 0,
      lastHealthAlertAt: new Date(now - 30 * 60 * 1000).toISOString(), // alerted after the last run
      cadenceMinutes: 15,
    }, now)
    expect(result.unhealthy).toBe(true)
    expect(result.situationChanged).toBe(false)
    expect(result.shouldAlert).toBe(false)
  })

  it('re-alerts once the function has run again since the last alert and is still unhealthy', () => {
    const result = evaluateFunctionHealth({
      lastRunAt: new Date(now - 60 * 60 * 1000).toISOString(),
      errorCount: ERROR_COUNT_THRESHOLD,
      lastHealthAlertAt: new Date(now - 90 * 60 * 1000).toISOString(), // alerted before the last run
      cadenceMinutes: 15,
    }, now)
    expect(result.situationChanged).toBe(true)
    expect(result.shouldAlert).toBe(true)
  })
})
