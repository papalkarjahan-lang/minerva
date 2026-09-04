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

const IDLE_THRESHOLD_DAYS = 14
const RENOTIFY_SUPPRESS_DAYS = 7 // don't re-flag the same still-idle asset every single day

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
      if (biz?.max_addons?.[key] === true) return true
      const trial = biz?.max_addon_trials?.[key]
      return !!trial?.ends_at && new Date(trial.ends_at).getTime() > Date.now()
    }

    const candidates = [...(neverPinged || []), ...(stalePinged || [])].filter(a => addonActive((a as any).business_id, 'asset_intelligence'))

    let flagged = 0
    for (const asset of candidates) {
      const { data: recentFlag } = await supabase.from('asset_telemetry_events')
        .select('id')
        .eq('asset_id', asset.id)
        .eq('event_type', 'idle_flagged')
        .gte('created_at', suppressSince)
        .limit(1)
      if (recentFlag && recentFlag.length > 0) continue

      await supabase.from('asset_telemetry_events').insert({
        asset_id: asset.id, business_id: asset.business_id, event_type: 'idle_flagged',
        detail: (asset as any).last_telemetry_at
          ? `No telemetry since ${(asset as any).last_telemetry_at} — idle ${IDLE_THRESHOLD_DAYS}+ days.`
          : `No telemetry ever recorded for this asset.`,
      })
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
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
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'detect-idle-assets', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
