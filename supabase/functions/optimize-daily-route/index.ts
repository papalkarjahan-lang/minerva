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
//
// Fixed 2026-09-24 (Round 43 continued): `verify_jwt:true` gave a false
// sense of protection (the public anon key alone satisfies it — see
// SECURITY_NOTES.md) but there was zero real caller-identity check. A
// bare technicianId let anyone overwrite that technician's real jobs'
// route_sequence/estimated_arrival_at for the day. Fixed requiring the
// business owner OR that specific technician (isOwnerOrAssignedTechnician
// — this function's only real caller is DispatcherView.jsx today, but the
// technician side is included since nothing about this action is
// owner-only, same reasoning as the SMS functions).
//
// UTC-default timezone bug (2026-09-25): the `date` param below has
// always been optional with a UTC-calendar-date fallback (see the
// comment right above `targetDate`) — but DispatcherView.jsx, this
// function's only real caller, never actually passed `date` at all,
// so that UTC fallback was ALWAYS what ran in production. For any
// dispatcher outside UTC (e.g. Sydney, UTC+10/11), from local midnight
// until UTC's own midnight rollover (i.e. most of the morning), the
// UTC calendar date is still YESTERDAY relative to the dispatcher's
// real "today" — so clicking "Optimize Route" first thing in the
// morning would silently query/sequence yesterday's jobs, not today's.
// Fixed in DispatcherView.jsx's optimizeTechRoute to compute and pass
// today's date from the browser's own local calendar fields (not
// toISOString, which is UTC) — this function's fallback below is now
// only a defensive default for a direct/manual invocation without a
// `date`, not the actual production code path.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { planRoute } from "./logic.ts"
import { isOwnerOrAssignedTechnician, getAuthenticatedCaller } from "../_shared/ownership.ts"

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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'optimize-daily-route').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: tech, error: techErr } = await supabase
      .from('technicians')
      .select('id, business_id, current_lat, current_lng, auth_user_id, businesses(owner_user_id, contact_email)')
      .eq('id', technicianId)
      .single()
    if (techErr || !tech) throw new Error('Technician not found')

    const caller = await getAuthenticatedCaller(req, supabase)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!isOwnerOrAssignedTechnician((tech as any).businesses, tech, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this technician.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

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

    // Nearest-neighbor chain from the technician's current position, with
    // estimated arrival times chained using AVG_SPEED_KMH travel + a fixed
    // per-stop dwell time — see header comment for the honest caveat on
    // both assumptions.
    const ordered = planRoute(
      tech.current_lat,
      tech.current_lng,
      remaining as { id: string; client_lat: number; client_lng: number }[],
      new Date(),
      AVG_SPEED_KMH,
      DEFAULT_STOP_MINUTES
    )

    let updated = 0
    for (const stop of ordered) {
      await supabase.from('jobs').update({
        route_sequence: stop.sequence,
        estimated_arrival_at: stop.estimatedArrival,
      }).eq('id', stop.id)
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
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'optimize-daily-route', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
