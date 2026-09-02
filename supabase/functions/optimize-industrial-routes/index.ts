// Supabase Edge Function: optimize-industrial-routes
// "Route Optimizer" — Field Service Management domain, industrial-sector
// variant. Cron sweep (every 30 min): for each active site_project with no
// asset currently geofenced to it, finds the nearest 'active' unassigned
// industrial_asset (straight-line distance — no live traffic API wired
// in, same honest scope as the rest of this sector) and posts a Slack
// suggestion. Deliberately suggests rather than auto-assigns — see
// industrial-conductor's header comment for why.
// Deploy with: supabase functions deploy optimize-industrial-routes

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: sites, error } = await supabase.from('site_projects')
      .select('id, business_id, name, site_lat, site_lng')
      .eq('status', 'active')
    if (error) throw error

    let suggested = 0
    for (const site of sites || []) {
      const { data: assigned } = await supabase.from('industrial_assets').select('id').eq('geofence_site_id', site.id).limit(1)
      if (assigned && assigned.length > 0) continue // already has an asset

      const { data: candidates } = await supabase.from('industrial_assets')
        .select('id, name, current_lat, current_lng')
        .eq('business_id', site.business_id)
        .eq('status', 'active')
        .is('geofence_site_id', null)

      if (!candidates || candidates.length === 0) continue

      let best: any = null
      let bestDist = Infinity
      for (const a of candidates) {
        if (a.current_lat == null || a.current_lng == null || site.site_lat == null || site.site_lng == null) continue
        const d = haversineMeters(a.current_lat, a.current_lng, site.site_lat, site.site_lng)
        if (d < bestDist) { bestDist = d; best = a }
      }
      if (!best) continue

      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: site.business_id, text: `🗺️ *Route Optimizer*: site *${site.name}* has no asset assigned — nearest free asset is *${best.name}* (${(bestDist / 1000).toFixed(1)}km away).` }),
      }).catch(() => {})
      suggested++
    }

    return new Response(JSON.stringify({ success: true, sitesEvaluated: (sites || []).length, suggested }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('optimize-industrial-routes error:', err)
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
