import { describe, it, expect } from 'vitest'
import { classifyTwilioAccountStatus, shouldAlert } from './logic'

describe('classifyTwilioAccountStatus', () => {
  it('is healthy when the API call succeeded and the account is active', () => {
    const result = classifyTwilioAccountStatus(true, 'active')
    expect(result.healthy).toBe(true)
    expect(result.service).toBe('twilio')
  })

  it('is unhealthy when the API call itself failed (bad credentials / unreachable)', () => {
    const result = classifyTwilioAccountStatus(false, null)
    expect(result.healthy).toBe(false)
    expect(result.detail).toContain('credentials are likely invalid')
  })

  it('is unhealthy when the account is suspended — the exact failure mode found live', () => {
    const result = classifyTwilioAccountStatus(true, 'suspended')
    expect(result.healthy).toBe(false)
    expect(result.detail).toContain('"suspended"')
  })

  it('is unhealthy when the account is closed', () => {
    const result = classifyTwilioAccountStatus(true, 'closed')
    expect(result.healthy).toBe(false)
    expect(result.detail).toContain('"closed"')
  })

  it('treats a missing status string as unhealthy rather than assuming active', () => {
    const result = classifyTwilioAccountStatus(true, null)
    expect(result.healthy).toBe(false)
  })
})

describe('shouldAlert', () => {
  it('never alerts when currently healthy, regardless of prior state', () => {
    expect(shouldAlert(null, true)).toBe(false)
    expect(shouldAlert('service_health_ok', true)).toBe(false)
    expect(shouldAlert('service_health_alert', true)).toBe(false)
  })

  it('alerts on the very first check ever, if already unhealthy', () => {
    expect(shouldAlert(null, false)).toBe(true)
  })

  it('alerts on a transition from healthy to unhealthy', () => {
    expect(shouldAlert('service_health_ok', false)).toBe(true)
  })

  it('does not re-alert for an already-known, still-unhealthy problem', () => {
    expect(shouldAlert('service_health_alert', false)).toBe(false)
  })
})
