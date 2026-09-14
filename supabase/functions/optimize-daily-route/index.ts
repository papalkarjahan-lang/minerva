// Supabase Edge Function: optimize-daily-route
// Human-click agent (like launch-ad-campaign/send-growth-message) — never
// runs on its own initiative. Called when a dispatcher clicks "Optimize
// Route" for one technician's remaining jobs today.
//
// HONESTY NOTE on method: this is a nearest-neighbor heuristic over
// straight-line (haversine) distance from the technician's current GPS
// position, chaining to each remaining job in turn — the same honest
// distance math already used elsewhere in this codebase (auto-assign-
// technician, estimate-job-carbon). It is NOT a true traveling-salesman
// solver and does NOT use real road routing or live traffic — exactly the
// same caveat estimate-job-carbon already states about its own distance
// math, applied here to sequencing instead of a carbon estimate. For a
// handful of stops in one day (the realistic case for a single
// technician), nearest-neighbor typically lands close to optimal; it is
// not guaranteed optimal for larger stop counts.
//
// Writes jobs.route_sequence (1-indexed visiting order) and
// jobs.estimated_arrival_at (chained from an assumed average travel speed,
// AVG_SPEED_KMH below) onto that technician's remaining jobs for today.
// Never touches technician_id, scheduled_time, or any other existing
// field — purely an additive ordering/estimate layer, exactly like
// route_sequence's own schema comment describes.
//
// Deploy with the multipart /functions/deploy Supabase Management API
// (no CLI in this project — see minerva_supabase_function_deploy_method
// memory), verify_jwt should match this project's other human-click
// functions (true, consistent with create-checkout-session etc.).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Assumed average travel speed for chained ETA estimates — a deliberately
// conservative urban/suburban trade-vehicle average, not a routing-API
// figure (none exists in this build). Documented here so anyone reading
// an estimated_arrival_at knows exactly what assumption produced it.
const AVG_SPEED_KMH = 40
// Minutes assumed on-site per stop before departing for the next one —
// used only to chain estimated_arrival_at forward stop-to-stop, not stored
// anywhere else. A rough default; a business with real average job
// duration data could tune this later, but no such data is aggregated yet.
const DEFAULT_STOP_MINUTES = 30

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { technicianId, date } = await req.json()
    if (!technicianId) {
      return new Response(JSON.stringify({ error: 'Missing technicianId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'optimize-daily-route').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: tech, error: techErr } = await supabase
      .from('technicians')
      .select('id, business_id, current_lat, current_lng')
      .eq('id', technicianId)
      .single()
    if (techErr || !tech) throw new Error('Technician not found')
    if (tech.current_lat == null || tech.current_lng == null) {
      return new Response(JSON.stringify({ success: true, skipped: 'no_technician_position' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Default to today (UTC date boundary — acceptable for a same-day
    // dispatcher tool where "today" is unambiguous from local usage).
    const targetDate = date || new Date().toISOString().slice(0, 10)
    const dayStart = `${targetDate}T00:00:00`
    const dayEnd = `${targetDate}T23:59:59`

    const { data: jobs, error: jobsErr } = await supabase
      .from('jobs')
      .select('id, client_lat, client_lng, scheduled_time, status')
      .eq('technician_id', technicianId)
      .in('status', ['scheduled', 'en_route', 'in_progress'])
      .gte('scheduled_time', dayStart)
      .lte('scheduled_time', dayEnd)

    if (jobsErr) throw jobsErr

    const remaining = (jobs || []).filter(j => j.client_lat != null && j.client_lng != null)
    if (remaining.length === 0) {
      supabase.rpc('record_agent_run', { fn_name: 'optimize-daily-route', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'no_geocoded_jobs_today', ordered: 0 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Nearest-neighbor chain from the technician's current position.
    const unvisited = [...remaining]
    let currentLat = tech.current_lat
    let currentLng = tech.current_lng
    let cursor = new Date()
    const ordered: { id: string; distanceKm: number }[] = []

    while (unvisited.length > 0) {
      let bestIdx = 0
      let bestDist = Infinity
      for (let i = 0; i < unvisited.length; i++) {
        const d = haversineKm(currentLat, currentLng, unvisited[i].client_lat, unvisited[i].client_lng)
        if (d < bestDist) { bestDist = d; bestIdx = i }
      }
      const next = unvisited.splice(bestIdx, 1)[0]
      ordered.push({ id: next.id, distanceKm: bestDist })
      currentLat = next.client_lat
      currentLng = next.client_lng
    }

    // Chain estimated arrival times using AVG_SPEED_KMH travel + a fixed
    // per-stop dwell time — see header comment for the honest caveat on
    // both assumptions.
    let updated = 0
    for (let i = 0; i < ordered.length; i++) {
      const travelMinutes = (ordered[i].distanceKm / AVG_SPEED_KMH) * 60
      cursor = new Date(cursor.getTime() + travelMinutes * 60000)
      const estimatedArrival = cursor.toISOString()
      cursor = new Date(cursor.getTime() + DEFAULT_STOP_MINUTES * 60000)

      await supabase.from('jobs').update({
        route_sequence: i + 1,
        estimated_arrival_at: estimatedArrival,
      }).eq('id', ordered[i].id)
      updated++
    }

    supabase.rpc('record_agent_run', { fn_name: 'optimize-daily-route', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, ordered: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('optimize-daily-route error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'optimize-daily-route', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
