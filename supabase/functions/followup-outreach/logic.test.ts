import { describe, it, expect } from 'vitest'
import { computeFollowupDecision, fallbackFollowup, STAGE_DAYS } from './logic'

const DAY_MS = 24 * 60 * 60 * 1000
const SENT_AT = '2026-09-01T00:00:00.000Z'
const sentAtMs = new Date(SENT_AT).getTime()

describe('computeFollowupDecision', () => {
  it('waits before the 3-day stage-0 threshold', () => {
    expect(computeFollowupDecision({ followup_stage: 0, sent_at: SENT_AT, last_followup_sent_at: null }, sentAtMs + 2 * DAY_MS))
      .toEqual({ action: 'wait' })
  })

  it('is due exactly at the 3-day stage-0 threshold (boundary is inclusive)', () => {
    expect(computeFollowupDecision({ followup_stage: 0, sent_at: SENT_AT, last_followup_sent_at: null }, sentAtMs + 3 * DAY_MS))
      .toEqual({ action: 'due', nextStage: 1 })
  })

  it('treats a missing/null followup_stage the same as stage 0', () => {
    expect(computeFollowupDecision({ followup_stage: null, sent_at: SENT_AT, last_followup_sent_at: null }, sentAtMs + 3 * DAY_MS))
      .toEqual({ action: 'due', nextStage: 1 })
  })

  it('uses last_followup_sent_at (not sent_at) as the baseline once stage >= 1', () => {
    const followupSentAt = '2026-09-10T00:00:00.000Z'
    const followupSentMs = new Date(followupSentAt).getTime()
    const p = { followup_stage: 1, sent_at: SENT_AT, last_followup_sent_at: followupSentAt }
    // Not yet 7 days past the follow-up (even though it's well past 7 days since sent_at).
    expect(computeFollowupDecision(p, followupSentMs + 6 * DAY_MS)).toEqual({ action: 'wait' })
    expect(computeFollowupDecision(p, followupSentMs + 7 * DAY_MS)).toEqual({ action: 'due', nextStage: 2 })
  })

  it('uses the 14-day threshold for stage 2', () => {
    const p = { followup_stage: 2, sent_at: SENT_AT, last_followup_sent_at: '2026-09-20T00:00:00.000Z' }
    const baselineMs = new Date(p.last_followup_sent_at).getTime()
    expect(computeFollowupDecision(p, baselineMs + 13 * DAY_MS)).toEqual({ action: 'wait' })
    expect(computeFollowupDecision(p, baselineMs + 14 * DAY_MS)).toEqual({ action: 'due', nextStage: 3 })
  })

  it('closes as lost once stage reaches the end of STAGE_DAYS, regardless of dates', () => {
    expect(computeFollowupDecision({ followup_stage: 3, sent_at: SENT_AT, last_followup_sent_at: null }, sentAtMs))
      .toEqual({ action: 'close_lost' })
    expect(computeFollowupDecision({ followup_stage: 99, sent_at: SENT_AT, last_followup_sent_at: null }, sentAtMs))
      .toEqual({ action: 'close_lost' })
  })

  it('waits (never crashes) when the required baseline timestamp is missing', () => {
    expect(computeFollowupDecision({ followup_stage: 0, sent_at: null, last_followup_sent_at: null }, sentAtMs + 100 * DAY_MS))
      .toEqual({ action: 'wait' })
    expect(computeFollowupDecision({ followup_stage: 1, sent_at: SENT_AT, last_followup_sent_at: null }, sentAtMs + 100 * DAY_MS))
      .toEqual({ action: 'wait' })
  })

  it('STAGE_DAYS has exactly 3 stages (3/7/14) matching the documented cadence', () => {
    expect(STAGE_DAYS).toEqual([3, 7, 14])
  })
})

describe('fallbackFollowup', () => {
  it('defaults the greeting when no contact name is known', () => {
    expect(fallbackFollowup({ contact_name: null, company_name: 'Acme Plumbing' }, 1).subject).toBe('Re: Quick question for Acme Plumbing')
  })

  it('labels stage 1 as "my first note", not "follow-up #1"', () => {
    const body = fallbackFollowup({ contact_name: 'Jane', company_name: 'Acme' }, 1).body
    expect(body).toContain('my first note')
    expect(body).not.toContain('follow-up #1')
  })

  it('labels stage 2/3 as "follow-up #N"', () => {
    expect(fallbackFollowup({ contact_name: 'Jane', company_name: 'Acme' }, 2).body).toContain('follow-up #2')
    expect(fallbackFollowup({ contact_name: 'Jane', company_name: 'Acme' }, 3).body).toContain('follow-up #3')
  })
})
