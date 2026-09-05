// Supabase Edge Function: auto-assign-technician
// Event-driven agent, called once by the on_job_created_auto_assign
// trigger (see supabase_schema.sql) right after a new job is inserted
// with no technician_id. Only actually assigns anyone if the job's
// business has auto_dispatch_enabled = true (checked here, not in the
// trigger, so businesses that don't use the feature pay zero cost beyond
// one cheap lookup).
//
// Picks the nearest active technician who currently has no current_job_id
// (i.e. free), using the same haversine formula as the frontend
// (src/utils.js) reimplemented here since edge functions can't import
// from src/. Falls back to "no technician available" (leaves the job
// unassigned for a human to pick up) if every technician is busy or none
// have a known GPS position yet.
//
// Fair-Rotation / Burnout Guard (additive, see supabase_schema.sql):
// selection is nearest-by-distance PLUS a soft tiebreak that
// deprioritizes — never hard-excludes — a technician who has been getting
// more than their share of emergency jobs lately (technicians.
// rolling_emergency_job_count, recomputed daily by
// update-technician-workload). Implemented as a small distance penalty
// (EMERGENCY_TIEBREAK_KM per recent emergency job) added on top of the
// real haversine distance before comparing candidates — a technician who
// is genuinely much closer still wins, but among comparably-close
// technicians the one who's been getting fewer emergency callouts lately
// is preferred. This never changes who's eligible (still "free,
// active, known position"), only who's picked among them.
//
// Hybrid workforce fallback (added 2026-09-04): if no employed technician
// is free, falls back to the nearest active subcontractor (subcontractors
// table) with a known position, same haversine-nearest logic, no emergency
// tiebreak (rolling_emergency_job_count doesn't apply to non-employees).
// Assigns via jobs.assigned_subcontractor_id, a separate column from
// technician_id, so nothing about existing technician-only logic elsewhere
// in the app (payroll, FBT-style hours tracking, etc.) is touched by a
// subcontractor assignment.
//
// Geofenced radius cap (added 2026-09-05, supabase_schema_delta_
// auto_dispatch_radius.sql): businesses.auto_dispatch_max_km, null by
// default (= unlimited, unchanged behaviour). If set, the nearest
// candidate (technician or subcontractor) is only auto-assigned when
// within that radius of the job's client_lat/client_lng — otherwise the
// job is left unassigned for a human to route, same as "nobody free"
// today. Prevents auto-dispatching someone absurdly far away just because
// everyone closer happened to be busy.
// Deploy with: supabase functions deploy auto-assign-technician

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Soft tiebreak weight — see comment above. 2km per recent emergency job
// is enough to swing a choice between two techs who are within a couple
// of km of each other, without overriding a genuinely much-nearer tech.
const EMERGENCY_TIEBREAK_KM = 2

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
    const { job_id } = await req.json()
    if (!job_id) {
      return new Response(JSON.stringify({ error: 'Missing job_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, business_id, technician_id, client_lat, client_lng, client_name')
      .eq('id', job_id)
      .single()
    if (jobErr || !job) throw new Error('Job not found')

    // Already assigned (e.g. dispatcher beat the agent to it) — nothing to do.
    if (job.technician_id) {
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'already_assigned' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('auto_dispatch_enabled, auto_dispatch_max_km, name, max_addons, max_addon_trials')
      .eq('id', job.business_id)
      .single()
    const maxKm = business?.auto_dispatch_max_km
    // subcontractor_pool is a paid Minerva Max add-on — the insert-time
    // trigger (supabase_schema_delta_subcontractor_pool_addon.sql) stops new
    // subcontractor rows being created without it, but a business that let
    // an active trial/subscription lapse could still have old subcontractor
    // rows sitting in the table, so this fallback needs its own check too.
    const subcontractorPoolActive = business?.max_addons?.subcontractor_pool === true ||
      (business?.max_addon_trials?.subcontractor_pool?.ends_at && new Date(business.max_addon_trials.subcontractor_pool.ends_at).getTime() > Date.now())

    if (!business?.auto_dispatch_enabled) {
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'auto_dispatch_disabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: techs } = await supabase
      .from('technicians')
      .select('id, name, current_lat, current_lng, current_job_id, is_active, rolling_emergency_job_count')
      .eq('business_id', job.business_id)
      .eq('is_active', true)
      .is('current_job_id', null)

    const free = (techs || []).filter(t => t.current_lat != null && t.current_lng != null)
    if (free.length === 0) {
      // No employed technician free — fall back to the subcontractor pool
      // before giving up entirely (only if the business's add-on is
      // actually active — see comment above).
      const { data: subs } = subcontractorPoolActive ? await supabase
        .from('subcontractors')
        .select('id, name, current_lat, current_lng')
        .eq('business_id', job.business_id)
        .eq('is_active', true)
        .not('current_lat', 'is', null)
        .not('current_lng', 'is', null) : { data: null }

      if (!subs || subs.length === 0) {
        supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
        return new Response(JSON.stringify({ success: true, skipped: 'no_technician_available' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }

      let nearestSub = subs[0]
      let nearestSubDist = null
      if (job.client_lat != null && job.client_lng != null) {
        let bestDist = Infinity
        for (const s of subs) {
          const d = haversineKm(job.client_lat, job.client_lng, s.current_lat, s.current_lng)
          if (d < bestDist) { bestDist = d; nearestSub = s }
        }
        nearestSubDist = bestDist
      }

      if (maxKm != null && nearestSubDist != null && nearestSubDist > maxKm) {
        supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
        return new Response(JSON.stringify({ success: true, skipped: 'nearest_beyond_max_km' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }

      await supabase.from('jobs').update({ assigned_subcontractor_id: nearestSub.id }).eq('id', job.id)
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          businessId: job.business_id,
          text: `🚚 No technician was free — auto-dispatched subcontractor *${nearestSub.name}* to job for *${job.client_name || 'client'}*.`,
        }),
      }).catch(() => {})
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, assigned_subcontractor_to: nearestSub.id }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    let nearest = free[0]
    let nearestDist = null
    if (job.client_lat != null && job.client_lng != null) {
      let bestScore = Infinity
      for (const t of free) {
        const d = haversineKm(job.client_lat, job.client_lng, t.current_lat, t.current_lng)
        const score = d + (t.rolling_emergency_job_count || 0) * EMERGENCY_TIEBREAK_KM
        if (score < bestScore) { bestScore = score; nearest = t; nearestDist = d }
      }
    }

    if (maxKm != null && nearestDist != null && nearestDist > maxKm) {
      supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'nearest_beyond_max_km' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    await supabase.from('jobs').update({ technician_id: nearest.id }).eq('id', job.id)
    await supabase.from('technicians').update({ current_job_id: job.id }).eq('id', nearest.id)

    await fetch(`${supabaseUrl}/functions/v1/send-job-assignment-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({ jobId: job.id, technicianId: nearest.id }),
    }).catch(() => {})

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({
        businessId: job.business_id,
        text: `🚚 Auto-dispatched *${nearest.name}* to job for *${job.client_name || 'client'}*.`,
      }),
    }).catch(() => {})

    supabase.rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, assigned_to: nearest.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('auto-assign-technician error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'auto-assign-technician', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
