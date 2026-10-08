// Supabase Edge Function: optimize-industrial-routes
// "Route Optimizer" — Field Service Management domain, industrial-sector
// variant. Cron sweep (every 30 min): for each active site_project with no
// asset currently geofenced to it, finds the nearest 'active' unassigned
// industrial_asset (straight-line distance — no live traffic API wired
// in, same honest scope as the rest of this sector) and posts a Slack
// suggestion. Deliberately suggests rather than auto-assigns — see
// industrial-conductor's header comment for why.
//
// Suppress-window dedup (added 2026-09-29, see supabase_schema_delta_
// optimize_routes_dedup.sql): unlike every other repeating-alert agent in
// this codebase, this function had no suppression at all — a site sitting
// without an asset for a day would get 48 identical Slack pings (one per
// 30-min tick), which in practice trains the team to mute the channel.
// Fixed via site_projects.route_suggested_at: suggest once, then go quiet
// for ROUTE_SUGGEST_SUPPRESS_HOURS before re-suggesting (in case the
// situation is still unresolved), matching detect-idle-assets'/predict-
// asset-maintenance's re-arm-after-suppress-window pattern.
// Deploy with: supabase functions deploy optimize-industrial-routes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { findNearestAsset } from "./logic.ts"
import { chunk } from "../_shared/batch.ts"

const ROUTE_SUGGEST_SUPPRESS_HOURS = 24 // don't re-suggest the same still-unassigned site every 30 min
const SITE_BATCH_SIZE = 20

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'optimize-industrial-routes').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: sites, error } = await supabase.from('site_projects')
      .select('id, business_id, name, site_lat, site_lng, route_suggested_at')
      .eq('status', 'active')
    if (error) throw error

    const suppressSince = new Date(Date.now() - ROUTE_SUGGEST_SUPPRESS_HOURS * 60 * 60 * 1000).toISOString()

    let suggested = 0
    // Bounded-concurrency batching (added 2026-10-08) — every active
    // site_project platform-wide, each costing 2-3 round trips, runs
    // every 30 minutes. Same chunk()-of-20 shape as the rest of this
    // round, see SCALE_READINESS_NOTES_ROUND2.md.
    for (const batch of chunk(sites || [], SITE_BATCH_SIZE)) {
      const results = await Promise.all(batch.map(site =>
        suggestAssetForOneSite(supabase, supabaseUrl, supabaseServiceKey, suppressSince, site)
      ))
      for (const wasSuggested of results) if (wasSuggested) suggested++
    }

    supabase.rpc('record_agent_run', { fn_name: 'optimize-industrial-routes', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, sitesEvaluated: (sites || []).length, suggested }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('optimize-industrial-routes error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'optimize-industrial-routes', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Extracted from the main loop (2026-10-08) so it can be run through
// chunk()'s bounded-concurrency batching — same logic that was previously
// inline, unchanged. Returns whether a suggestion was sent for this site.
async function suggestAssetForOneSite(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string,
  suppressSince: string,
  site: any
): Promise<boolean> {
  if (site.route_suggested_at && site.route_suggested_at > suppressSince) return false // suggested recently, still quiet

  const { data: assigned } = await supabase.from('industrial_assets').select('id').eq('geofence_site_id', site.id).limit(1)
  if (assigned && assigned.length > 0) return false // already has an asset

  const { data: candidates } = await supabase.from('industrial_assets')
    .select('id, name, current_lat, current_lng')
    .eq('business_id', site.business_id)
    .eq('status', 'active')
    .is('geofence_site_id', null)

  if (!candidates || candidates.length === 0) return false

  const nearest = findNearestAsset(candidates, site.site_lat, site.site_lng)
  if (!nearest) return false
  const { asset: best, distanceMeters: bestDist } = nearest

  // Atomically claim this site before notifying — an already-claimed
  // site (a concurrent/overlapping run, or one already suggested inside
  // the suppress window by a run we raced with) skips the Slack send.
  const { data: claimed, error: claimErr } = await supabase
    .from('site_projects')
    .update({ route_suggested_at: new Date().toISOString() })
    .eq('id', site.id)
    .or(`route_suggested_at.is.null,route_suggested_at.lt.${suppressSince}`)
    .select('id')
  if (claimErr) { console.error('optimize-industrial-routes: claim failed:', claimErr.message); return false }
  if (!claimed || claimed.length === 0) return false // already claimed by a concurrent/prior run

  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
    body: JSON.stringify({ businessId: site.business_id, text: `🗺️ *Route Optimizer*: site *${site.name}* has no asset assigned — nearest free asset is *${best.name}* (${(bestDist / 1000).toFixed(1)}km away).` }),
  }).catch(() => {})
  return true
}
