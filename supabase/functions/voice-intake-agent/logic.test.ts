import { describe, it, expect } from 'vitest'
import { computeVoiceTemplateScore, runTemplateVoiceIntake } from './logic'

describe('computeVoiceTemplateScore', () => {
  it('scores an emergency higher than a routine job', () => {
    expect(computeVoiceTemplateScore(true, 10, false)).toBe(75)
    expect(computeVoiceTemplateScore(false, 10, false)).toBe(50)
  })
  it('adds 10 for a job description over 40 chars (shorter threshold than the text widget)', () => {
    expect(computeVoiceTemplateScore(false, 41, false)).toBe(60)
  })
  it('adds 10 for high-value keywords', () => { expect(computeVoiceTemplateScore(false, 10, true)).toBe(60) })
  it('stacks all bonuses and clamps at 100', () => { expect(computeVoiceTemplateScore(true, 100, true)).toBe(95) })
})

describe('runTemplateVoiceIntake', () => {
  const business = { name: 'Acme Plumbing' }

  it('asks the opening question with no turns yet', () => {
    const result = runTemplateVoiceIntake(business, [])
    expect(result.lead_captured).toBe(false)
    expect(result.reply).toContain('Acme Plumbing')
  })

  it('walks through the fixed 4-field order (no phone question — Caller ID)', () => {
    expect(runTemplateVoiceIntake(business, ['leaky tap']).reply).toContain('urgent right now')
    expect(runTemplateVoiceIntake(business, ['leaky tap', 'no rush']).reply).toContain('grab your name')
    expect(runTemplateVoiceIntake(business, ['leaky tap', 'no rush', 'Jane Smith']).reply).toContain('suburb')
  })

  it('captures a lead once all four fields are answered', () => {
    const result = runTemplateVoiceIntake(business, ['full bathroom renovation', 'not urgent', 'Jane Smith', 'Parramatta'])
    expect(result.lead_captured).toBe(true)
    expect(result.lead).toMatchObject({ name: 'Jane Smith', suburb: 'Parramatta', urgency: 'routine', estimated_value_tier: 'high' })
  })

  it('correctly classifies "not urgent" as routine (shares the fixed negation logic with ai-intake-chat)', () => {
    const result = runTemplateVoiceIntake(business, ['leaky tap', 'not urgent', 'Jane Smith', 'Parramatta'])
    expect(result.lead?.urgency).toBe('routine')
  })

  it('classifies a genuine emergency correctly', () => {
    const result = runTemplateVoiceIntake(business, ['burst pipe flooding the kitchen', 'yes emergency', 'Jane Smith', 'Parramatta'])
    expect(result.lead?.urgency).toBe('emergency')
    expect(result.lead?.score).toBeGreaterThanOrEqual(75)
  })
})
