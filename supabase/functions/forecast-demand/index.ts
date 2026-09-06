// Supabase Edge Function: forecast-demand
// Autonomous agent, run weekly via pg_cron. For each business, buckets its
// own `jobs` (all statuses, so it counts real bookings not just completed
// ones) by client_address (used as a rough suburb proxy — this schema has
// no dedicated suburb column on jobs) into the last 4 weekly buckets, and
// compares the most recent 2 weeks' average against the prior 2 weeks'
// average per address. Flags addresses/areas with a clear upward trend.
//
// Honest limitation: this is trend arithmetic (recent-average vs
// older-average), not a trained forecasting model, and client_address is
// often a full street address rather than a suburb, so "areas" here can be
// noisier/more granular than true suburb-level demand. Still useful as a
// directional signal ("bookings near X are picking up"), not a scheduling
// commitment.
// Writes one `agent_insights` row per business (only when a real upward
// trend is found — most weeks will produce nothing for a small business,
// which is correct, not a bug). Reuses the same table Phase 2/3 of the
// Agent OS build already writes to.
//
// Cross-agent data sharing (added 2026-09-06, supabase_schema_delta_
// growth_forecast_sharing.sql): also sets agent_insights.trend_address to
// the same address as a structured field (summary above is prose-only),
// so generate-growth-drafts can consume this signal directly instead of
// re-deriving its own trend from scratch.
// Deploy with: supabase functions deploy forecast-demand

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const LOOKBACK_DAYS = 28 // 4 weekly buckets
const MIN_RECENT_COUNT = 3 // don't flag noise from 1-2 jobs
const TREND_RATIO = 1.3 // recent 2wk avg must be >= 1.3x older 2wk avg

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'forecast-demand').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    // Minerva Max: this is a paid add-on (demand_forecast) — only run the
    // trend scan for businesses that have it enabled or are trialing it.
    // See src/maxAddons.js for the frontend equivalent of this check.
    const { data: businesses } = await supabase.from('businesses').select('id, max_addons, max_addon_trials')
    const addonActive = (biz: any, key: string) => {
      if (biz?.max_addons?.[key] === true) return true
      const trial = biz?.max_addon_trials?.[key]
      return !!trial?.ends_at && new Date(trial.ends_at).getTime() > Date.now()
    }

    const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    let flagged = 0

    for (const biz of businesses || []) {
      if (!addonActive(biz, 'demand_forecast')) continue
      const { data: jobs } = await supabase
        .from('jobs')
        .select('client_address, created_at')
        .eq('business_id', biz.id)
        .gte('created_at', cutoff)
        .not('client_address', 'is', null)

      if (!jobs || jobs.length < MIN_RECENT_COUNT) continue

      const now = Date.now()
      const twoWeeksMs = 14 * 24 * 60 * 60 * 1000
      const recentCutoff = now - twoWeeksMs

      // address -> { recent: count, older: count }
      const buckets: Record<string, { recent: number; older: number }> = {}
      for (const job of jobs) {
        const addr = (job.client_address || '').trim()
        if (!addr) continue
        const t = new Date(job.created_at).getTime()
        if (!buckets[addr]) buckets[addr] = { recent: 0, older: 0 }
        if (t >= recentCutoff) buckets[addr].recent++
        else buckets[addr].older++
      }

      let best: { addr: string; recent: number; older: number; ratio: number } | null = null
      for (const [addr, counts] of Object.entries(buckets)) {
        if (counts.recent < MIN_RECENT_COUNT) continue
        const olderAvg = Math.max(counts.older, 1) // avoid div-by-zero, treat 0 older as 1 for a conservative ratio
        const ratio = counts.recent / olderAvg
        if (ratio >= TREND_RATIO && (!best || ratio > best.ratio)) {
          best = { addr, recent: counts.recent, older: counts.older, ratio }
        }
      }

      if (best) {
        await supabase.from('agent_insights').insert({
          agent: 'scheduling',
          insight_type: 'demand_forecast',
          business_id: biz.id,
          summary: `Bookings trending up near "${best.addr}" — ${best.recent} job(s) in the last 2 weeks vs ${best.older} in the 2 weeks before (trend math on your own job history, not a forecast model). Consider pre-positioning a technician or checking availability in that area.`,
          // Structured copy of the trending address (summary above is prose-only) —
          // lets generate-growth-drafts consume this signal without re-parsing text.
          trend_address: best.addr,
        })
        flagged++
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'forecast-demand', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, businessesScanned: (businesses || []).length, flagged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('forecast-demand error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'forecast-demand', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
