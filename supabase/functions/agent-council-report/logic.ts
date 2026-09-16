// Pure logic extracted from agent-council-report/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

export const ERROR_COUNT_THRESHOLD = 5

export interface AgentInsightRow {
  id: string
  agent: string
  insight_type: string
  summary: string
  created_at: string
}

export interface AgentFunctionRow {
  id: string
  name: string
  agent: string
  last_run_at: string | null
  last_status: string | null
  error_count: number
}

export function groupInsightsByAgent(insights: AgentInsightRow[]): Record<string, AgentInsightRow[]> {
  const insightsByAgent: Record<string, AgentInsightRow[]> = {}
  for (const row of insights) {
    const key = row.agent || 'core'
    if (!insightsByAgent[key]) insightsByAgent[key] = []
    insightsByAgent[key].push(row)
  }
  return insightsByAgent
}

export function countInsightsByType(insights: AgentInsightRow[]): Record<string, number> {
  const countsByType: Record<string, number> = {}
  for (const row of insights) {
    countsByType[row.insight_type] = (countsByType[row.insight_type] || 0) + 1
  }
  return countsByType
}

export function filterUnhealthyFunctions(
  functions: AgentFunctionRow[],
  threshold: number = ERROR_COUNT_THRESHOLD
): AgentFunctionRow[] {
  return functions.filter(f => (f.error_count ?? 0) >= threshold || f.last_status === 'error')
}

// Plain-text data rollup — always computable with no LLM involved. Used
// verbatim as the fallback summary when no ANTHROPIC_API_KEY is configured
// (or the AI call fails/comes back unusable), and also passed to Claude as
// the grounding data for the AI-authored version.
export function buildDataRollup(
  insightsByAgent: Record<string, AgentInsightRow[]>,
  countsByType: Record<string, number>,
  unhealthyFunctions: AgentFunctionRow[],
  functionsChecked: number,
  insightsReviewed: number
): string {
  const lines: string[] = []
  lines.push(`Agent functions tracked: ${functionsChecked}`)
  lines.push(`Agent insights written in the last 7 days: ${insightsReviewed}`)

  lines.push('')
  lines.push('Insights by agent:')
  const agentKeys = Object.keys(insightsByAgent)
  if (agentKeys.length === 0) {
    lines.push('  (none)')
  } else {
    for (const agent of agentKeys) {
      lines.push(`  - ${agent}: ${insightsByAgent[agent].length}`)
    }
  }

  lines.push('')
  lines.push('Insights by type:')
  const typeKeys = Object.keys(countsByType)
  if (typeKeys.length === 0) {
    lines.push('  (none)')
  } else {
    for (const type of typeKeys) {
      lines.push(`  - ${type}: ${countsByType[type]}`)
    }
  }

  lines.push('')
  lines.push(`Unhealthy agent functions (error_count >= ${ERROR_COUNT_THRESHOLD} or last_status = 'error'):`)
  if (unhealthyFunctions.length === 0) {
    lines.push('  (none)')
  } else {
    for (const fn of unhealthyFunctions) {
      lines.push(`  - ${fn.name} (${fn.agent}): last_status=${fn.last_status ?? 'unknown'}, error_count=${fn.error_count}, last_run_at=${fn.last_run_at ?? 'never'}`)
    }
  }

  return lines.join('\n')
}
