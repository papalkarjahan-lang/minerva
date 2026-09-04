// Supabase Edge Function: predict-asset-maintenance
// Cron sweep (daily) — upgrades the existing reactive threshold check in
// monitor-asset-telemetry (which only fires once engine_hours has ALREADY
// crossed the maintenance interval) into a genuinely predictive one: looks
// at an asset's recent telemetry pings, computes its actual usage rate
// (engine hours per day, from real ping history — not a guess), and flags
// any asset projected to cross its maintenance threshold within the next
// PREDICT_WINDOW_DAYS, before it actually happens.
//
// HONESTY NOTE: this is a simple linear projection from this business's own
// asset history (first ping vs. most recent ping in the lookback window),
// not a cross-client failure model — there isn't enough data volume yet for
// that to mean anything, and this build never shares one business's asset
// data with another's. It's real math on real data, just not "AI" in any
// meaningful sense.
// Deploy with: supabase functions deploy predict-asset-maintenance

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const LOOKBACK_DAYS = 14
const PREDICT_WINDOW_DAYS = 7
const RENOTIFY_SUPPRESS_DAYS = 3 // don't re-flag the same asset every single day once predicted

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: assets, error } = await supabase.from('industrial_assets')
      .select('id, business_id, name, engine_hours, maintenance_interval_hours, last_maintenance_at_hours')
      .eq('status', 'active')
    if (error) throw error

    const lookbackSince = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString()
    const suppressSince = new Date(Date.now() - RENOTIFY_SUPPRESS_DAYS * 24 * 60 * 60 * 1000).toISOString()

    let evaluated = 0
    let predicted = 0

    for (const asset of assets || []) {
      evaluated++

      const { data: pings } = await supabase.from('asset_telemetry_events')
        .select('engine_hours, created_at')
        .eq('asset_id', asset.id)
        .eq('event_type', 'ping')
        .not('engine_hours', 'is', null)
        .gte('created_at', lookbackSince)
        .order('created_at', { ascending: true })

      if (!pings || pings.length < 2) continue // not enough real data to project a trend

      const first = pings[0]
      const last = pings[pings.length - 1]
      const hoursElapsedDays = (new Date(last.created_at).getTime() - new Date(first.created_at).getTime()) / (24 * 60 * 60 * 1000)
      if (hoursElapsedDays <= 0) continue

      const engineHoursDelta = (last.engine_hours || 0) - (first.engine_hours || 0)
      if (engineHoursDelta <= 0) continue // idle or reading error, no usage trend to project

      const dailyRate = engineHoursDelta / hoursElapsedDays
      const dueAt = (asset.last_maintenance_at_hours || 0) + (asset.maintenance_interval_hours || 250)
      const hoursRemaining = dueAt - (last.engine_hours || asset.engine_hours || 0)
      if (hoursRemaining <= 0) continue // already past due — monitor-asset-telemetry's reactive check owns this case

      const daysUntilDue = hoursRemaining / dailyRate
      if (daysUntilDue > PREDICT_WINDOW_DAYS) continue // not close enough yet

      // Throttle: skip if we already predicted this within the suppress window
      const { data: recentPrediction } = await supabase.from('asset_telemetry_events')
        .select('id')
        .eq('asset_id', asset.id)
        .eq('event_type', 'maintenance_predicted')
        .gte('created_at', suppressSince)
        .limit(1)
      if (recentPrediction && recentPrediction.length > 0) continue

      const roundedDays = Math.max(1, Math.round(daysUntilDue))
      await supabase.from('asset_telemetry_events').insert({
        asset_id: asset.id, business_id: asset.business_id, event_type: 'maintenance_predicted',
        engine_hours: last.engine_hours,
        detail: `Projected to hit maintenance threshold in ~${roundedDays} day${roundedDays === 1 ? '' : 's'} at current usage rate (${dailyRate.toFixed(1)}h/day).`,
      })
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: asset.business_id, text: `📈 *Predictive Maintenance*: *${asset.name}* is on track to need maintenance in ~${roundedDays} day${roundedDays === 1 ? '' : 's'} at its current usage rate — schedule it before it becomes a reactive breakdown.` }),
      }).catch(() => {})
      predicted++
    }

    return new Response(JSON.stringify({ success: true, evaluated, predicted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('predict-asset-maintenance error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
