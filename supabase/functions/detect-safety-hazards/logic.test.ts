import { describe, it, expect } from 'vitest'
import { computeOpenPresenceByPerson, hasHumanMachineOverlap, Checkin } from './logic.ts'

function checkin(overrides: Partial<Checkin>): Checkin {
  return {
    id: 'c1',
    person_name: 'Alice',
    role: 'human_technician',
    checkin_type: 'arrival',
    created_at: '2026-09-01T00:00:00Z',
    ...overrides,
  }
}

describe('computeOpenPresenceByPerson', () => {
  it('tracks a person as present after arrival', () => {
    const open = computeOpenPresenceByPerson([checkin({ checkin_type: 'arrival' })])
    expect(open.get('Alice')).toBe('human_technician')
  })

  it('removes a person after departure', () => {
    const open = computeOpenPresenceByPerson([
      checkin({ checkin_type: 'arrival' }),
      checkin({ checkin_type: 'departure' }),
    ])
    expect(open.has('Alice')).toBe(false)
  })

  it('keeps a person present through task_start and task_complete without a departure (regression: 2026-09-07 fix)', () => {
    const open = computeOpenPresenceByPerson([
      checkin({ checkin_type: 'arrival' }),
      checkin({ checkin_type: 'task_start' }),
      checkin({ checkin_type: 'task_complete' }),
    ])
    expect(open.get('Alice')).toBe('human_technician')
  })

  it('falls back to id as the key when person_name is null', () => {
    const open = computeOpenPresenceByPerson([checkin({ person_name: null, id: 'abc123' })])
    expect(open.get('abc123')).toBe('human_technician')
  })

  it('handles multiple distinct people independently', () => {
    const open = computeOpenPresenceByPerson([
      checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'arrival' }),
      checkin({ person_name: 'Bot-1', role: 'automated_process', checkin_type: 'arrival' }),
      checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'departure' }),
    ])
    expect(open.has('Alice')).toBe(false)
    expect(open.get('Bot-1')).toBe('automated_process')
  })
})

describe('hasHumanMachineOverlap', () => {
  it('returns false when no one is on site', () => {
    expect(hasHumanMachineOverlap([])).toBe(false)
  })

  it('returns false with only a human on site', () => {
    expect(hasHumanMachineOverlap([checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'arrival' })])).toBe(false)
  })

  it('returns false with only a machine on site', () => {
    expect(hasHumanMachineOverlap([checkin({ person_name: 'Bot-1', role: 'automated_process', checkin_type: 'arrival' })])).toBe(false)
  })

  it('returns true when a human and a machine are both on site', () => {
    expect(hasHumanMachineOverlap([
      checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'arrival' }),
      checkin({ person_name: 'Bot-1', role: 'automated_process', checkin_type: 'arrival' }),
    ])).toBe(true)
  })

  it('returns false once the human has departed, even if the machine is still on site', () => {
    expect(hasHumanMachineOverlap([
      checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'arrival' }),
      checkin({ person_name: 'Bot-1', role: 'automated_process', checkin_type: 'arrival' }),
      checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'departure' }),
    ])).toBe(false)
  })

  it('still detects overlap across a task_start/task_complete sequence with no departure', () => {
    expect(hasHumanMachineOverlap([
      checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'arrival' }),
      checkin({ person_name: 'Bot-1', role: 'automated_process', checkin_type: 'arrival' }),
      checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'task_start' }),
      checkin({ person_name: 'Alice', role: 'human_technician', checkin_type: 'task_complete' }),
    ])).toBe(true)
  })
})
