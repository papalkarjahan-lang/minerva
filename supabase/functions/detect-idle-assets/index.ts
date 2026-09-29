// Supabase Edge Function: detect-idle-assets
// Cron sweep (daily) — "ghost asset" detection. Flags active industrial
// assets that haven't sent a telemetry ping in IDLE_THRESHOLD_DAYS, which
// on a real deployment (once a telemetry vendor or manual ping source is
// wired to monitor-asset-telemetry) means the asset itself has gone quiet:
// sitting unused on a site, forgotten in a yard, or its tracker/feed has
// failed. Either way it's worth a human look — an unused asset earning
// nothing is the same cost as an idle rental.
// Deploy with: supabase functions deploy detect-idle-assets

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isAddonActive } from "../_shared/maxAddons.ts"

const IDLE_THRESHOLD_DAYS = 14
const RENOTIFY_SUPPRESS_DAYS = 7 // don't re-flag the same still-idle asset every single day

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'detect-idle-assets').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const idleSince = new Date(Date.now() - IDLE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const suppressSince = new Date(Date.now() - RENOTIFY_SUPPRESS_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Idle = status active AND (never pinged, OR last ping older than threshold).
    const { data: neverPinged } = await supabase.from('industrial_assets')
      .select('id, business_id, name')
      .eq('status', 'active')
      .is('last_telemetry_at', null)

    const { data: stalePinged } = await supabase.from('industrial_assets')
      .select('id, business_id, name, last_telemetry_at')
      .eq('status', 'active')
      .lt('last_telemetry_at', idleSince)

    // Minerva Max: this is a paid add-on (asset_intelligence) — only flag
    // assets belonging to a business that has it enabled or is trialing
    // it. See src/maxAddons.js for the frontend equivalent.
    const { data: businesses } = await supabase.from('businesses').select('id, max_addons, max_addon_trials')
    const addonActive = (bizId: string, key: string) => {
      const biz = (businesses || []).find((b: any) => b.id === bizId)
      return isAddonActive(biz, key)
    }

    const candidates = [...(neverPinged || []), ...(stalePinged || [])].filter(a => addonActive((a as any).business_id, 'asset_intelligence'))

    let flagged = 0
    for (const asset of candidates) {
      // Atomically claim this asset before flagging — the previous design
      // checked "flagged within the suppress window?" with a plain SELECT
      // against asset_telemetry_events and only inserted the flag event
      // afterward, so two overlapping daily runs could both pass the check
      // and both insert a flag event + Slack-alert for the same idle asset.
      // Fixed 2026-09-29 via industrial_assets.idle_flagged_at, same
      // claim-before-notify pattern as optimize-industrial-routes'
      // route_suggested_at (added earlier the same day).
      const { data: claimed, error: claimErr } = await supabase
        .from('industrial_assets')
        .update({ idle_flagged_at: new Date().toISOString() })
        .eq('id', asset.id)
        .or(`idle_flagged_at.is.null,idle_flagged_at.lt.${suppressSince}`)
        .select('id')
      if (claimErr) { console.error('detect-idle-assets: claim failed:', claimErr.message); continue }
      if (!claimed || claimed.length === 0) continue // already flagged recently by a concurrent/prior run

      await supabase.from('asset_telemetry_events').insert({
        asset_id: asset.id, business_id: asset.business_id, event_type: 'idle_flagged',
        detail: (asset as any).last_telemetry_at
          ? `No telemetry since ${(asset as any).last_telemetry_at} — idle ${IDLE_THRESHOLD_DAYS}+ days.`
          : `No telemetry ever recorded for this asset.`,
      })
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ businessId: asset.business_id, text: `👻 *Ghost Asset*: *${asset.name}* hasn't reported in ${IDLE_THRESHOLD_DAYS}+ days — worth checking if it's sitting unused, or its tracking feed has gone quiet.` }),
      }).catch(() => {})
      flagged++
    }

    supabase.rpc('record_agent_run', { fn_name: 'detect-idle-assets', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, evaluated: candidates.length, flagged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('detect-idle-assets error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'detect-idle-assets', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
