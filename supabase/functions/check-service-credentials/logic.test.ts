import { describe, it, expect } from 'vitest'
import { classifyTwilioAccountStatus, describePhoneNumberGap, shouldAlert } from './logic'

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

describe('describePhoneNumberGap', () => {
  it('tells the user to fix the account first when it is not healthy', () => {
    const detail = describePhoneNumberGap(false, [])
    expect(detail).toContain('no "From" number')
    expect(detail).not.toContain('already has')
  })

  it('says to buy a number when the account is healthy but none exist', () => {
    const detail = describePhoneNumberGap(true, [])
    expect(detail).toContain('no phone number is purchased')
  })

  it('names the existing number(s) when the account already has one, so the fix is "set the secret" not "buy a number"', () => {
    const detail = describePhoneNumberGap(true, ['+61412345678'])
    expect(detail).toContain('+61412345678')
    expect(detail).toContain('already has a real number purchased')
    expect(detail).not.toContain('no phone number is purchased')
  })

  it('truncates a long list of numbers rather than dumping all of them', () => {
    const detail = describePhoneNumberGap(true, ['+1', '+2', '+3', '+4', '+5'])
    expect(detail).toContain('+2 more')
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
