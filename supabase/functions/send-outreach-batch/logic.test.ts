import { describe, it, expect } from 'vitest'
import { computeSentUpdates } from './logic'

const NOW = '2026-09-24T00:00:00.000Z'

describe('computeSentUpdates', () => {
  it('sets sent_at on the very first send (no prior sent_at, stage 0)', () => {
    expect(computeSentUpdates({ sent_at: null, followup_stage: 0 }, NOW)).toEqual({ status: 'sent', sent_at: NOW })
  })

  it('treats a missing/null followup_stage the same as stage 0', () => {
    expect(computeSentUpdates({ sent_at: null, followup_stage: null }, NOW)).toEqual({ status: 'sent', sent_at: NOW })
  })

  it('never overwrites an already-set sent_at', () => {
    const result = computeSentUpdates({ sent_at: '2026-09-01T00:00:00.000Z', followup_stage: 0 }, NOW)
    expect(result.sent_at).toBeUndefined()
    expect(result.status).toBe('sent')
  })

  it('sets last_followup_sent_at (not sent_at) when sending a follow-up (stage > 0)', () => {
    const result = computeSentUpdates({ sent_at: '2026-09-01T00:00:00.000Z', followup_stage: 1 }, NOW)
    expect(result).toEqual({ status: 'sent', last_followup_sent_at: NOW })
  })

  it('sets both fields for the edge case of a stage > 0 row with no sent_at yet', () => {
    const result = computeSentUpdates({ sent_at: null, followup_stage: 2 }, NOW)
    expect(result).toEqual({ status: 'sent', sent_at: NOW, last_followup_sent_at: NOW })
  })
})
