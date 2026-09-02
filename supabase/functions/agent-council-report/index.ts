// Supabase Edge Function: agent-council-report
// Autonomous agent, run WEEKLY via pg_cron (see
// supabase_schema_delta_agent_council_cron.sql). Part of the Agent
// Operating System, Phase 4. This is the "Agent Council" — a weekly,
// LLM-authored (or, if no key, plain-data) synthesis of the last 7 days of
// `agent_insights` + `agent_functions` health data, ACROSS THE WHOLE
// PLATFORM, written for the MINERVA OPERATOR (the person running this SaaS
// business) — not for any one of Minerva's own customers. Unlike every
// other notification in this codebase, this report has no single
// `business_id` it belongs to, so it is NOT posted through notify-slack
// (which requires a businessId and posts to THAT business's own webhook —
// see notify-slack/index.ts). There is no "Minerva's own Slack" concept
// anywhere in this codebase, and this function does not invent one.
//
// Deploy with: supabase functions deploy agent-council-report
//
// Required secret: none. Optional: ANTHROPIC_API_KEY — if set, the weekly
// data is sent to Claude to produce a short plain-English narrative summary,
// pattern callouts, and 2-4 concrete suggestions grounded ONLY in the actual
// data (the prompt explicitly forbids generic advice). If the key is
// missing, the call fails, or the response comes back empty/unusable, this
// falls back to a plain, honestly-labeled data rollup ("AI reasoning
// unavailable — showing raw data summary") instead of pretending to be the
// AI version — same honesty convention as verify-checklist-photos'
// verification_status='unavailable' and the Phase 2 outreach/finance
// fallback pattern.
//
// KNOWN LIMITATION (Phase 4, by design, not hidden): this report has NO
// Slack/email delivery yet. It is only written to `agent_council_reports` —
// a human operator has to query that table directly (Supabase Table Editor,
// or `select * from agent_council_reports order by created_at desc limit 1`)
// to actually read it. Phase 5 is expected to add a dashboard UI to surface
// it properly; until then, this is intentionally a storage-only report, not
// a delivered one.
//
// Cost guardrail: max_tokens is capped at 1200 on the Claude call below.
// This function runs weekly forever once cron'd — without a cap it could
// keep generating a longer and longer response over time with no natural
// stopping point, so the cap is deliberate, not an oversight.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

const KNOWN_AGENTS = ['outreach', 'marketing', 'scheduling', 'research', 'finance', 'design']
const ERROR_COUNT_THRESHOLD = 5

interface AgentInsightRow {
  id: string
  agent: string
  insight_type: string
  summary: string
  created_at: string
}

interface AgentFunctionRow {
  id: string
  name: string
  agent: string
  last_run_at: string | null
  last_status: string | null
  error_count: number
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  try {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekAgoIso = weekAgo.toISOString()
    const weekStart = weekAgoIso.slice(0, 10)
    const weekEnd = now.toISOString().slice(0, 10)

    // Never let an empty table (fresh deployment, nothing written yet)
    // throw — both queries default to [] on no rows.
    const [{ data: insightsRaw, error: insightsErr }, { data: functionsRaw, error: functionsErr }] = await Promise.all([
      supabase
        .from('agent_insights')
        .select('id, agent, insight_type, summary, created_at')
        .gte('created_at', weekAgoIso)
        .order('created_at', { ascending: false }),
      supabase
        .from('agent_functions')
        .select('id, name, agent, last_run_at, last_status, error_count'),
    ])
    if (insightsErr) throw insightsErr
    if (functionsErr) throw functionsErr

    const insights: AgentInsightRow[] = insightsRaw || []
    const functions: AgentFunctionRow[] = functionsRaw || []

    const functionsChecked = functions.length
    const insightsReviewed = insights.length
    const unhealthyFunctions = functions.filter(f => (f.error_count ?? 0) >= ERROR_COUNT_THRESHOLD || f.last_status === 'error')
    const unhealthyFunctionCount = unhealthyFunctions.length

    const insightsByAgent: Record<string, AgentInsightRow[]> = {}
    for (const row of insights) {
      const key = row.agent || 'core'
      if (!insightsByAgent[key]) insightsByAgent[key] = []
      insightsByAgent[key].push(row)
    }

    const countsByType: Record<string, number> = {}
    for (const row of insights) {
      countsByType[row.insight_type] = (countsByType[row.insight_type] || 0) + 1
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
    const rollupText = buildDataRollup(insightsByAgent, countsByType, unhealthyFunctions, functionsChecked, insightsReviewed)

    let summary: string
    if (insightsReviewed === 0 && unhealthyFunctionCount === 0) {
      // Genuinely quiet week (or a fresh deployment with no data yet) —
      // don't bother calling Claude for this, and don't manufacture drama.
      summary = `Quiet week (${weekStart} to ${weekEnd}) — no agent_insights were written and no agent_functions are currently unhealthy. ${functionsChecked} agent function(s) tracked, nothing to flag.`
    } else if (anthropicKey) {
      summary = await draftCouncilReport(anthropicKey, weekStart, weekEnd, insightsByAgent, countsByType, unhealthyFunctions, functionsChecked, insightsReviewed, rollupText)
    } else {
      summary = `AI reasoning unavailable — showing raw data summary.\n\n${rollupText}`
    }

    const { error: insertErr } = await supabase.from('agent_council_reports').insert({
      week_start: weekStart,
      week_end: weekEnd,
      summary,
      functions_checked: functionsChecked,
      insights_reviewed: insightsReviewed,
      unhealthy_function_count: unhealthyFunctionCount,
    })
    if (insertErr) throw insertErr

    supabase.rpc('record_agent_run', { fn_name: 'agent-council-report', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({
      success: true,
      week_start: weekStart,
      week_end: weekEnd,
      functions_checked: functionsChecked,
      insights_reviewed: insightsReviewed,
      unhealthy_function_count: unhealthyFunctionCount,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('agent-council-report error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'agent-council-report', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})

// Plain-text data rollup — always computable with no LLM involved. Used
// verbatim as the fallback summary when no ANTHROPIC_API_KEY is configured
// (or the AI call fails/comes back unusable), and also passed to Claude as
// the grounding data for the AI-authored version.
function buildDataRollup(
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

// Sends the week's data to Claude and asks for a short narrative report.
// Returns the honestly-labeled data-rollup fallback if the key is missing
// (caller already checks that before calling this), the call fails, or the
// response looks empty/unusable — this function is never allowed to throw.
async function draftCouncilReport(
  apiKey: string,
  weekStart: string,
  weekEnd: string,
  insightsByAgent: Record<string, AgentInsightRow[]>,
  countsByType: Record<string, number>,
  unhealthyFunctions: AgentFunctionRow[],
  functionsChecked: number,
  insightsReviewed: number,
  rollupText: string
): Promise<string> {
  const fallback = `AI reasoning unavailable — showing raw data summary.\n\n${rollupText}`

  try {
    // Cap how many individual insight summaries we hand to Claude (keeps
    // the prompt bounded even on a very busy week) — most recent first,
    // per agent, up to 8 each.
    const sampleLines: string[] = []
    for (const agent of Object.keys(insightsByAgent)) {
      const rows = insightsByAgent[agent].slice(0, 8)
      sampleLines.push(`\n${agent} (${insightsByAgent[agent].length} total this week):`)
      for (const row of rows) {
        sampleLines.push(`  - [${row.insight_type}] ${row.summary}`)
      }
    }

    const systemPrompt = `You are an internal engineering/ops advisor reviewing the last week of an AI agent platform's telemetry, for the platform's own operator (not a customer of the platform). You will be given real counts and real insight summaries from the platform's own database — no other context exists beyond what's given. Base every suggestion on the specific data below, do not give generic advice. The platform has 6 possible agent categories: outreach, marketing, scheduling, research, finance, design — "research" and "design" do not exist as real agents yet, so only discuss an agent if it actually has data in the input below; do not hallucinate activity for an agent with zero data. Keep the whole reply well under 1200 tokens.`

    const userPrompt = `Reporting period: ${weekStart} to ${weekEnd}.
Agent functions tracked: ${functionsChecked}
Total agent_insights written this week: ${insightsReviewed}
Insights by type: ${JSON.stringify(countsByType)}

Unhealthy agent functions (error_count >= ${ERROR_COUNT_THRESHOLD} or last_status = 'error'):
${unhealthyFunctions.length === 0 ? '(none)' : unhealthyFunctions.map(f => `- ${f.name} (${f.agent}): last_status=${f.last_status ?? 'unknown'}, error_count=${f.error_count}, last_run_at=${f.last_run_at ?? 'never'}`).join('\n')}

Individual insight summaries this week, grouped by agent:${sampleLines.length > 0 ? sampleLines.join('\n') : '\n(none)'}

Write a short report with exactly three sections, using this exact formatting (Slack-markdown style, *bold* headers):
*Summary* — 2-4 sentences, plain English, what actually happened this week across the agents that have data.
*Patterns worth attention* — anything notable a human should look at, or say "Nothing stands out this week" if genuinely nothing does.
*Suggestions* — 2 to 4 concrete, specific suggestions for improving efficiency, cost, or coverage, each grounded in a specific piece of the data above (cite the agent/function/number). Do not give generic SaaS advice unrelated to this data.`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        // Deliberate cost guardrail — this runs weekly forever once cron'd,
        // so the response length is capped rather than left open-ended.
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!res.ok) return fallback
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    if (!text) return fallback
    return text
  } catch (err) {
    console.error('agent-council-report: Claude draft failed', err)
    return fallback
  }
}
