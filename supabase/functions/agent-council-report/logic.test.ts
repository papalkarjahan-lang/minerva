import { describe, it, expect } from 'vitest'
import {
  groupInsightsByAgent,
  countInsightsByType,
  filterUnhealthyFunctions,
  buildDataRollup,
  type AgentInsightRow,
  type AgentFunctionRow,
} from './logic'

function insight(overrides: Partial<AgentInsightRow> = {}): AgentInsightRow {
  return { id: '1', agent: 'outreach', insight_type: 'lead_pattern', summary: 'summary', created_at: '2026-09-01T00:00:00Z', ...overrides }
}

function fn(overrides: Partial<AgentFunctionRow> = {}): AgentFunctionRow {
  return { id: '1', name: 'nurture-stale-leads', agent: 'outreach', last_run_at: null, last_status: 'ok', error_count: 0, ...overrides }
}

describe('groupInsightsByAgent', () => {
  it('groups insights by their agent field', () => {
    const result = groupInsightsByAgent([insight({ agent: 'outreach' }), insight({ agent: 'finance' }), insight({ agent: 'outreach' })])
    expect(result.outreach.length).toBe(2)
    expect(result.finance.length).toBe(1)
  })

  it('falls back to "core" when agent is empty/falsy', () => {
    const result = groupInsightsByAgent([insight({ agent: '' })])
    expect(result.core.length).toBe(1)
  })

  it('returns an empty object for no insights', () => {
    expect(groupInsightsByAgent([])).toEqual({})
  })
})

describe('countInsightsByType', () => {
  it('counts insights per insight_type', () => {
    const result = countInsightsByType([
      insight({ insight_type: 'lead_pattern' }),
      insight({ insight_type: 'lead_pattern' }),
      insight({ insight_type: 'cost_alert' }),
    ])
    expect(result).toEqual({ lead_pattern: 2, cost_alert: 1 })
  })

  it('returns an empty object for no insights', () => {
    expect(countInsightsByType([])).toEqual({})
  })
})

describe('filterUnhealthyFunctions', () => {
  it('flags a function with error_count at or above the threshold', () => {
    const result = filterUnhealthyFunctions([fn({ error_count: 5 }), fn({ error_count: 4 })])
    expect(result.length).toBe(1)
    expect(result[0].error_count).toBe(5)
  })

  it('flags a function with last_status = error regardless of error_count', () => {
    const result = filterUnhealthyFunctions([fn({ error_count: 0, last_status: 'error' })])
    expect(result.length).toBe(1)
  })

  it('does not flag a healthy function', () => {
    const result = filterUnhealthyFunctions([fn({ error_count: 0, last_status: 'ok' })])
    expect(result.length).toBe(0)
  })

  it('respects a custom threshold', () => {
    expect(filterUnhealthyFunctions([fn({ error_count: 2, last_status: 'ok' })], 2).length).toBe(1)
    expect(filterUnhealthyFunctions([fn({ error_count: 1, last_status: 'ok' })], 2).length).toBe(0)
  })
})

describe('buildDataRollup', () => {
  it('produces "(none)" sections when there is no data', () => {
    const text = buildDataRollup({}, {}, [], 3, 0)
    expect(text).toContain('Agent functions tracked: 3')
    expect(text).toContain('Agent insights written in the last 7 days: 0')
    expect(text).toMatch(/Insights by agent:\s*\n\s*\(none\)/)
    expect(text).toMatch(/Insights by type:\s*\n\s*\(none\)/)
    expect(text).toMatch(/Unhealthy agent functions.*:\s*\n\s*\(none\)/)
  })

  it('lists agents, types, and unhealthy functions when present', () => {
    const insightsByAgent = groupInsightsByAgent([insight({ agent: 'outreach' })])
    const countsByType = countInsightsByType([insight({ insight_type: 'lead_pattern' })])
    const unhealthy = [fn({ name: 'chase-unpaid-invoices', error_count: 6, last_status: 'error' })]
    const text = buildDataRollup(insightsByAgent, countsByType, unhealthy, 10, 1)
    expect(text).toContain('- outreach: 1')
    expect(text).toContain('- lead_pattern: 1')
    expect(text).toContain('- chase-unpaid-invoices (outreach): last_status=error, error_count=6')
  })
})
