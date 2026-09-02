// Supabase Edge Function: monitor-asset-telemetry
// "The Operator" + "The Warden"'s telemetry half — Asset Tracking &
// Lifecycle domain. Real-time ingestion endpoint for machine telemetry.
//
// HONESTY NOTE: there's no real RFID/Bluetooth reader or machine telematics
// feed connected yet — no such hardware exists in this build. This is the
// real, working ingestion side: point an actual telemetry vendor's webhook
// (or a temporary manual "ping" from the Industrial console) at this
// endpoint with { assetId, lat, lng, engineHours } and it will log the
// ping, then run the same geofence/maintenance checks a real feed would
// trigger.
// Deploy with: supabase functions deploy monitor-asset-telemetry

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only — this is a real-time ingestion endpoint, not a cron sweep' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { assetId, lat, lng, engineHours } = await req.json()
    if (!assetId) throw new Error('assetId is required')

    const { data: asset, error } = await supabase.from('industrial_assets')
      .select('id, business_id, name, geofence_site_id, maintenance_interval_hours, last_maintenance_at_hours')
      .eq('id', assetId).maybeSingle()
    if (error || !asset) throw new Error('asset not found')

    await supabase.from('industrial_assets').update({
      current_lat: lat ?? undefined,
      current_lng: lng ?? undefined,
      engine_hours: engineHours ?? undefined,
    }).eq('id', assetId)

    await supabase.from('asset_telemetry_events').insert({
      asset_id: assetId, business_id: asset.business_id, event_type: 'ping', lat, lng, engine_hours: engineHours,
    })

    // Geofence check
    if (asset.geofence_site_id && lat != null && lng != null) {
      const { data: site } = await supabase.from('site_projects').select('site_lat, site_lng, geofence_radius_m').eq('id', asset.geofence_site_id).maybeSingle()
      if (site?.site_lat != null && site?.site_lng != null) {
        const distanceM = haversineMeters(lat, lng, site.site_lat, site.site_lng)
        if (distanceM > (site.geofence_radius_m || 200)) {
          await supabase.from('asset_telemetry_events').insert({
            asset_id: assetId, business_id: asset.business_id, event_type: 'geofence_breach',
            lat, lng, detail: `${Math.round(distanceM)}m outside assigned site geofence`,
          })
          await notify(supabaseUrl, supabaseAnonKey, asset.business_id,
            `🚨 *Audit*: asset *${asset.name}* is ${Math.round(distanceM)}m outside its assigned site geofence.`)
        }
      }
    }

    // Maintenance threshold check
    if (engineHours != null) {
      const dueAt = (asset.last_maintenance_at_hours || 0) + (asset.maintenance_interval_hours || 250)
      if (engineHours >= dueAt) {
        await supabase.from('asset_telemetry_events').insert({
          asset_id: assetId, business_id: asset.business_id, event_type: 'maintenance_due',
          engine_hours: engineHours, detail: `${engineHours}h reached, interval ${asset.maintenance_interval_hours}h`,
        })
        await notify(supabaseUrl, supabaseAnonKey, asset.business_id,
          `🔧 *Audit*: asset *${asset.name}* has hit its preventative-maintenance threshold (${engineHours}h).`)
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('monitor-asset-telemetry error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

async function notify(supabaseUrl: string, supabaseAnonKey: string, businessId: string, text: string) {
  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ businessId, text }),
  }).catch(() => {})
}
