import { describe, it, expect } from 'vitest'
import { evaluateTrialEndingReminder, formatWhenText } from './logic'

const DAY_MS = 24 * 60 * 60 * 1000
const WINDOW_DAYS = 3

describe('evaluateTrialEndingReminder', () => {
  it('does not send, but DOES claim, when status is not trialing — stops it being re-checked via Stripe forever', () => {
    // The critical case: a business that converts to paid (or cancels)
    // before ever reaching the reminder window must still get claimed,
    // or it stays in every future run's candidate set permanently and
    // this function calls Stripe for it on every single run forever —
    // the exact "self-clearing isn't bounded" trap this codebase's own
    // SCALE_READINESS_NOTES_ROUND2.md already documents for a different
    // function.
    const nowMs = 1_700_000_000_000
    const trialEndSeconds = Math.floor(nowMs / 1000) + 2 * 24 * 60 * 60
    for (const status of ['active', 'canceled', 'past_due']) {
      const result = evaluateTrialEndingReminder(status, trialEndSeconds, nowMs, WINDOW_DAYS)
      expect(result.shouldSend).toBe(false)
      expect(result.shouldClaim).toBe(true)
    }
  })

  it('does not send or claim when trial_end is null or undefined, even if status is trialing', () => {
    const nowMs = 1_700_000_000_000
    expect(evaluateTrialEndingReminder('trialing', null, nowMs, WINDOW_DAYS)).toEqual({ shouldSend: false, shouldClaim: true, daysLeft: 0 })
    expect(evaluateTrialEndingReminder('trialing', undefined, nowMs, WINDOW_DAYS)).toEqual({ shouldSend: false, shouldClaim: true, daysLeft: 0 })
  })

  it('sends and claims when trialing and trial_end is within the window — exact seconds-to-ms conversion check', () => {
    // nowMs is a fixed, known instant. trial_end is exactly 2 days later,
    // expressed the way Stripe actually sends it: Unix SECONDS, not ms.
    // This is a direct regression guard against a seconds/ms mixup, which
    // would make this comparison silently wrong by a factor of 1000
    // rather than throwing.
    const nowMs = 1_700_000_000_000
    const trialEndSeconds = Math.floor(nowMs / 1000) + 2 * 24 * 60 * 60
    const result = evaluateTrialEndingReminder('trialing', trialEndSeconds, nowMs, WINDOW_DAYS)
    expect(result.shouldSend).toBe(true)
    expect(result.shouldClaim).toBe(true)
    expect(result.daysLeft).toBe(2)
  })

  it('does not send OR claim when trial_end is more than windowDays away — still trialing, just not due yet, must stay a candidate', () => {
    const nowMs = 1_700_000_000_000
    const trialEndSeconds = Math.floor(nowMs / 1000) + 4 * 24 * 60 * 60
    const result = evaluateTrialEndingReminder('trialing', trialEndSeconds, nowMs, WINDOW_DAYS)
    expect(result.shouldSend).toBe(false)
    expect(result.shouldClaim).toBe(false)
  })

  it('sends at exactly the window boundary', () => {
    const nowMs = 1_700_000_000_000
    const trialEndSeconds = Math.floor(nowMs / 1000) + WINDOW_DAYS * 24 * 60 * 60
    expect(evaluateTrialEndingReminder('trialing', trialEndSeconds, nowMs, WINDOW_DAYS).shouldSend).toBe(true)
  })

  it('does not send once trial_end is in the past, but also does not claim — Stripe/webhook handles the actual conversion, which will flip status away from trialing on a later run and claim it then', () => {
    const nowMs = 1_700_000_000_000
    const trialEndSeconds = Math.floor(nowMs / 1000) - 60 * 60 // 1 hour ago
    const result = evaluateTrialEndingReminder('trialing', trialEndSeconds, nowMs, WINDOW_DAYS)
    expect(result.shouldSend).toBe(false)
    expect(result.shouldClaim).toBe(false)
  })

  it('reports daysLeft as 0 (not negative) when the trial ends within the next 24h', () => {
    const nowMs = 1_700_000_000_000
    const trialEndSeconds = Math.floor(nowMs / 1000) + 3 * 60 * 60 // 3 hours from now
    const result = evaluateTrialEndingReminder('trialing', trialEndSeconds, nowMs, WINDOW_DAYS)
    expect(result.shouldSend).toBe(true)
    expect(result.daysLeft).toBe(0)
  })

  it('rounds a partial day down (floor, not ceil) — 1.5 days left reports as 1, never overstating runway', () => {
    const nowMs = 1_700_000_000_000
    const trialEndSeconds = Math.floor((nowMs + 1.5 * DAY_MS) / 1000)
    const result = evaluateTrialEndingReminder('trialing', trialEndSeconds, nowMs, WINDOW_DAYS)
    expect(result.daysLeft).toBe(1)
  })
})

describe('formatWhenText', () => {
  it('says "ends today" for 0 days left', () => {
    expect(formatWhenText(0)).toBe('ends today')
  })

  it('uses singular "day" for exactly 1 day left', () => {
    expect(formatWhenText(1)).toBe('ends in 1 day')
  })

  it('uses plural "days" for more than 1 day left', () => {
    expect(formatWhenText(2)).toBe('ends in 2 days')
    expect(formatWhenText(3)).toBe('ends in 3 days')
  })
})
