// Supabase Edge Function: notify-addon-trial-ending
// Autonomous agent, run daily via pg_cron (see matching *_cron.sql delta).
//
// WHY: Minerva Max add-on trials (businesses.max_addon_trials, 30 days —
// see src/maxAddons.js/supabase_schema_delta_minerva_max_tier.sql) already
// gate access purely by comparing `ends_at` to now() at read time — no
// cron needs to "turn off" a lapsed trial, it just stops passing
// isTrialing() on its own. But nothing ever told the business a trial was
// about to lapse. The in-app upsell-nudge banner (computeUpsellNudges,
// DispatcherView) is usage-triggered and only visible while someone is
// looking at the dispatcher screen — a business that isn't logged in when
// a trial is about to end gets no warning at all before losing access to
// a feature they may have started relying on. This closes that gap the
// same way every other "something needs a human's attention soon" gap in
// this codebase is closed: a Slack alert.
//
// Scans every business's max_addon_trials for any addon trial ending
// within 3 days that (a) hasn't already been converted to a paid addon
// (max_addons[key] === true) and (b) hasn't already been reminded about
// (reminder_sent_at, stored inside that same trial's own JSON — no schema
// change needed). Same claim-before-act pattern as every other agent with
// side effects in this codebase, expressed here as a PostgREST JSON-path
// filter (`max_addon_trials->{key}->>reminder_sent_at=is.null`) so the
// conditional UPDATE's WHERE exactly mirrors the SELECT that found it —
// an overlapping run's claim on the same key affects 0 rows and is
// skipped.
//
// This function is called with no body (cron passes '{}') — it scans
// across ALL businesses in one run, not just one.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { notifySlack } from "../_shared/notifySlack.ts"

const TRIAL_REMINDER_WINDOW_DAYS = 3

const ADDON_NAMES: Record<string, string> = {
  surge_pricing: 'Emergency Surge Pricing',
  ai_quotes: 'AI Quote Drafting',
  crew_splitting: 'Multi-Tech Job Splitting',
  review_loop: 'Review Request Loop',
  demand_forecast: 'Demand Trend Alerts',
  subcontractor_pool: 'Subcontractor Pool',
  asset_intelligence: 'Asset Intelligence',
  carbon_estimate: 'Carbon/ESG Estimate',
  xero_sync: 'Xero Sync',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'notify-addon-trial-ending').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const nowMs = Date.now()
    const now = new Date(nowMs).toISOString()
    const windowMs = TRIAL_REMINDER_WINDOW_DAYS * 24 * 60 * 60 * 1000

    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, max_addons, max_addon_trials')

    if (error) throw error

    let alerted = 0
    for (const biz of businesses || []) {
      const trials = biz.max_addon_trials || {}
      if (Object.keys(trials).length === 0) continue
      for (const key of Object.keys(trials)) {
        const trial = trials[key]
        if (!trial?.ends_at || trial.reminder_sent_at) continue
        if (biz.max_addons?.[key] === true) continue // already converted to paid

        const msLeft = new Date(trial.ends_at).getTime() - nowMs
        if (msLeft > windowMs || msLeft < 0) continue // not due yet, or already lapsed silently

        // Atomically claim this addon's reminder before alerting — see
        // header comment. A concurrent run's claim affects 0 rows.
        const { data: claimed, error: claimErr } = await supabase
          .from('businesses')
          .update({ max_addon_trials: { ...trials, [key]: { ...trial, reminder_sent_at: now } } })
          .eq('id', biz.id)
          .filter(`max_addon_trials->${key}->>reminder_sent_at`, 'is', null)
          .select('id')
        if (claimErr) { console.error('notify-addon-trial-ending: claim failed:', claimErr.message); continue }
        if (!claimed || claimed.length === 0) continue // already claimed by a concurrent run

        const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)))
        const addonName = ADDON_NAMES[key] || key
        const whenText = daysLeft <= 0 ? 'ends today' : `ends in ${daysLeft}d`
        await notifySlack(supabaseUrl, supabaseServiceKey, biz.id,
          `\u23F3 Your trial of *${addonName}* ${whenText}. Enable it from the MAX tab to keep using it — otherwise it just quietly turns off, no charge either way.`)

        alerted++
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'notify-addon-trial-ending', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({
      success: true,
      scanned: (businesses || []).length,
      alerted,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('notify-addon-trial-ending error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      createClient(supabaseUrl, supabaseServiceKey)
        .rpc('record_agent_run', { fn_name: 'notify-addon-trial-ending', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
