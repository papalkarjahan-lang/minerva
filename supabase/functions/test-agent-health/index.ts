// Supabase Edge Function: test-agent-health
// Autonomous agent, run every 15 min via pg_cron. Part of the Agent
// Operating System, Phase 1 (infrastructure). Self-testing layer for every
// other autonomous edge function in Minerva (original + Track A/B).
//
// This deliberately does NOT invoke any of the functions it's checking.
// Most of them have real side effects (sending SMS, posting to Slack,
// charging Stripe metadata, writing dispatch decisions) — firing them for
// real just to "health check" would be its own source of harm, so this is
// a passive, data-only check: it reads run-history rows written by
// record_agent_run() (see supabase_schema_delta_agent_infra.sql) and flags
// a function as unhealthy if either:
//   - it looks STALE: its last_run_at is older than expected for its known
//     cron cadence (cadence map below, hand-maintained from the cron
//     entries in supabase_schema.sql / supabase_schema_delta_agent_cron.sql
//     — functions with no known cadence, e.g. webhook/on-demand-only
//     functions, are skipped for the staleness check), or it has never
//     recorded a run at all despite being enabled.
//   - its ERROR COUNT has crossed a threshold (5+) — error_count is
//     cumulative (see record_agent_run's comment), so this catches agents
//     that are erroring repeatedly even if any single run "completes".
//
// Alert delivery: a cross-tenant infra alert like "chase-unpaid-invoices
// hasn't run in 2 days" isn't about any single business, but notify-slack
// (see supabase/functions/notify-slack/index.ts) requires a businessId and
// posts to THAT business's own Slack webhook — there is no
// "Minerva's own Slack" concept anywhere in this codebase. Rather than
// invent one or pick an arbitrary business to notify (which would be
// actively misleading — that business didn't cause this and can't fix it),
// this writes an agent_insights row instead (agent='core',
// insight_type='health_alert') and logs to console. That's the correct
// audience for this signal today: a human operator reading Supabase logs
// or a future ops dashboard — not a tradie's Slack channel.
//
// Dedup: mirrors check-inventory-levels' low_stock_alert_sent_at pattern.
// agent_functions.last_health_alert_at is only set/cleared based on whether
// last_run_at has advanced past the last alert time — i.e. we only alert
// again once the function has actually run again since our last alert
// (and is still unhealthy), not on every 15-min sweep for the same
// unresolved episode.
//
// Deploy with: supabase functions deploy test-agent-health

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Hand-maintained cadence map (minutes) for functions on a known cron
// schedule — see supabase_schema.sql / supabase_schema_delta_agent_cron.sql
// for the source of truth. Functions not listed here are webhook/on-demand/
// event-triggered only, so staleness doesn't apply to them (only the
// error-count check does).
const CADENCE_MINUTES: Record<string, number> = {
  'verify-checklist-photos': 15,
  'run-custom-workflows': 15,
  'industrial-conductor': 15,
  'detect-safety-hazards': 15,
  'sequence-handoffs': 15,
  'detect-wasted-trips': 15,
  'optimize-industrial-routes': 30,
  'nurture-stale-leads': 60,
  'track-consumables': 60,
  'verify-industrial-compliance': 60,
  'chase-unpaid-invoices': 24 * 60,
  'daily-digest': 24 * 60,
  'reconcile-billing': 24 * 60,
  'check-inventory-levels': 24 * 60,
  'winback-lost-leads': 24 * 60,
  'enrich-industrial-leads': 24 * 60,
  'check-credential-expiry': 24 * 60,
  'check-weather-risk': 24 * 60,
  'update-technician-workload': 24 * 60,
  'retention-checkin': 7 * 24 * 60,
  'generate-growth-drafts': 7 * 24 * 60,
  'test-agent-health': 15,
}

// Buffer multiplier so normal cron jitter / a slightly-late run doesn't
// false-positive — a function is only "stale" once it's overdue by this
// many multiples of its own cadence, with a minimum floor so fast (15min)
// cadences aren't flagged over trivial delays either.
const STALE_MULTIPLIER = 3
const STALE_FLOOR_MINUTES = 30
const ERROR_COUNT_THRESHOLD = 5

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: fns, error } = await supabase
      .from('agent_functions')
      .select('id, name, agent, last_run_at, last_status, error_count, last_health_alert_at')
      .eq('enabled', true)
    if (error) throw error

    const now = Date.now()
    let checked = 0
    let unhealthy = 0
    let alerted = 0

    for (const fn of fns || []) {
      checked++

      const cadenceMinutes = CADENCE_MINUTES[fn.name]
      const lastRunMs = fn.last_run_at ? new Date(fn.last_run_at).getTime() : null

      let isStale = false
      if (cadenceMinutes) {
        const staleThresholdMs = Math.max(cadenceMinutes * STALE_MULTIPLIER, STALE_FLOOR_MINUTES) * 60 * 1000
        isStale = lastRunMs === null || (now - lastRunMs) > staleThresholdMs
      }

      const isErrorHeavy = (fn.error_count ?? 0) >= ERROR_COUNT_THRESHOLD

      if (!isStale && !isErrorHeavy) continue
      unhealthy++

      // Dedup: only alert if we've never alerted before, or the function
      // has run again since our last alert (a "new" occurrence of the
      // unhealthy condition, not the same unresolved one we already flagged).
      const lastAlertMs = fn.last_health_alert_at ? new Date(fn.last_health_alert_at).getTime() : null
      const situationChanged = lastAlertMs === null || (lastRunMs !== null && lastRunMs > lastAlertMs)
      if (!situationChanged) continue

      const reasons: string[] = []
      if (isStale) {
        reasons.push(lastRunMs === null
          ? 'has never recorded a run'
          : `last ran ${Math.round((now - lastRunMs) / 60000)} min ago (expected every ${cadenceMinutes} min)`)
      }
      if (isErrorHeavy) reasons.push(`error_count=${fn.error_count} (threshold ${ERROR_COUNT_THRESHOLD})`)

      const summary = `Agent function "${fn.name}" (${fn.agent}) looks unhealthy: ${reasons.join('; ')}.`
      console.error('test-agent-health:', summary)

      await supabase.from('agent_insights').insert({
        agent: 'core',
        insight_type: 'health_alert',
        summary,
        related_table: 'agent_functions',
        related_id: fn.id,
      })

      await supabase.from('agent_functions').update({ last_health_alert_at: new Date().toISOString() }).eq('id', fn.id)
      alerted++
    }

    return new Response(JSON.stringify({ success: true, checked, unhealthy, alerted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('test-agent-health error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
