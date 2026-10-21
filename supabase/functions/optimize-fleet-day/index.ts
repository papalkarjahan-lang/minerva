// Supabase Edge Function: optimize-fleet-day
// Human-click agent (like optimize-daily-route, which this builds on) —
// never runs on its own initiative. Called when a dispatcher clicks
// "Optimize Fleet" for the whole business's remaining unstarted jobs
// today, rather than one technician's own stop order.
//
// HONESTY NOTE on method: see logic.ts's own header comments
// (greedyAssignJobs, twoOptImprove) for the exact caveats on each step —
// this is a greedy nearest-pair assignment across technicians, improved
// with a bounded 2-opt pass per technician's resulting stop list. NOT a
// true vehicle-routing solver. It is bounded by construction to never
// apply a plan worse than today's actual current assignment (see the
// baseline comparison below) — if the heuristic can't find a real
// improvement, it changes nothing and says so, rather than reshuffling
// jobs for no real benefit.
//
// Scope: only jobs with status='scheduled' (not yet 'en_route'/
// 'in_progress'/'complete') are eligible to move — a job already under
// way stays exactly where it is, same reasoning optimize-daily-route
// already applies to its own technician_id. Only technicians with
// is_active=true and a known current GPS position are considered.
//
// Standard-tier+ trade feature (hasStandardAutomation) — this is exactly
// the "more volume than one person can personally track by hand"
// automation Standard already differentiates on (see
// _shared/tierEligibility.ts's own header for that reasoning), checked
// server-side here as well as hidden in the UI for an ineligible tier —
// same "don't trust a client-side-only gate for anything billable" lesson
// SECURITY_NOTES.md's billing_identity_guard entry already established.
//
// Reassigning a job to a DIFFERENT technician than it already had fires
// the same send-job-assignment-sms + run-custom-workflows 'job.assigned'
// side effects assignJob's manual path already does in DispatcherView.jsx
// — a client shouldn't be left thinking the wrong person is coming.
// Resequencing a job that stays with its existing technician does not
// (same as optimize-daily-route, which never notifies for a pure
// re-order).
//
// Deploy with the multipart /functions/deploy Supabase Management API (no
// CLI in this project — see minerva_supabase_function_deploy_method
// memory), verify_jwt should match this project's other human-click
// functions (true).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { greedyAssignJobs, swapImproveAssignment, relocateImproveAssignment, twoOptImprove, chainEtas, currentPlanDistanceKm, type FleetJob } from "./logic.ts"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"
import { hasStandardAutomation } from "../_shared/tierEligibility.ts"

// Same conservative urban/suburban assumption as optimize-daily-route —
// see that function's own header for the honest caveat (no routing-API
// figure exists in this build).
const AVG_SPEED_KMH = 40
const DEFAULT_STOP_MINUTES = 30
// Below this, don't bother reshuffling jobs for a fraction-of-a-km
// "improvement" that's really just floating-point noise or a change no
// dispatcher would notice or care about.
const MIN_KM_SAVED_TO_APPLY = 0.5

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { businessId, date } = await req.json()
    if (!businessId) {
      return new Response(JSON.stringify({ error: 'Missing businessId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'optimize-fleet-day').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id, owner_user_id, contact_email, subscription_tier, sector, total_km_saved')
      .eq('id', businessId)
      .single()
    if (bizErr || !business) throw new Error('Business not found')

    const caller = await getAuthenticatedCaller(req, supabase)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!isOwnerOfBusiness(business, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!hasStandardAutomation(business.subscription_tier, business.sector)) {
      return new Response(JSON.stringify({ error: 'Fleet optimization needs the Standard or Pro plan.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: technicians, error: techErr } = await supabase
      .from('technicians')
      .select('id, current_lat, current_lng, name')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .not('current_lat', 'is', null)
      .not('current_lng', 'is', null)
    if (techErr) throw techErr
    if (!technicians || technicians.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: 'no_available_technicians' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const targetDate = date || new Date().toISOString().slice(0, 10)
    const dayStart = `${targetDate}T00:00:00`
    const dayEnd = `${targetDate}T23:59:59`

    const { data: jobsRaw, error: jobsErr } = await supabase
      .from('jobs')
      .select('id, client_name, client_lat, client_lng, technician_id, route_sequence, scheduled_time, status')
      .eq('business_id', businessId)
      .eq('status', 'scheduled')
      .gte('scheduled_time', dayStart)
      .lte('scheduled_time', dayEnd)
    if (jobsErr) throw jobsErr

    const jobs: FleetJob[] = (jobsRaw || []).filter(j => j.client_lat != null && j.client_lng != null)
    if (jobs.length === 0) {
      supabase.rpc('record_agent_run', { fn_name: 'optimize-fleet-day', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'no_geocoded_jobs_today' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const previousTechnicianByJob = new Map(jobs.map(j => [j.id, j.technician_id]))
    const baselineKm = currentPlanDistanceKm(technicians, jobs)

    const greedyAssignment = greedyAssignJobs(technicians, jobs)
    // Two local-search passes on top of the greedy assignment — see
    // swapImproveAssignment's and relocateImproveAssignment's own headers
    // for the exact method/guarantee of each. Both are strictly
    // non-worsening, so chaining them can only help, never hurt, the
    // final comparison against baselineKm below.
    const swapped = swapImproveAssignment(technicians, jobs, greedyAssignment)
    const assignment = relocateImproveAssignment(technicians, jobs, swapped)
    const jobsById = new Map(jobs.map(j => [j.id, j]))

    let proposedKm = 0
    const perTechStops = new Map<string, ReturnType<typeof chainEtas>>()
    for (const tech of technicians) {
      const theirJobIds = assignment.get(tech.id) || []
      const theirJobs = theirJobIds.map(id => jobsById.get(id)!).filter(Boolean)
      if (theirJobs.length === 0) continue
      const ordered = twoOptImprove(tech.current_lat, tech.current_lng, theirJobs)
      const stops = chainEtas(tech.current_lat, tech.current_lng, ordered, new Date(), AVG_SPEED_KMH, DEFAULT_STOP_MINUTES)
      perTechStops.set(tech.id, stops)
      proposedKm += stops.reduce((sum, s) => sum + s.distanceKm, 0)
    }

    const kmSaved = baselineKm - proposedKm
    if (kmSaved < MIN_KM_SAVED_TO_APPLY) {
      supabase.rpc('record_agent_run', { fn_name: 'optimize-fleet-day', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, skipped: 'already_near_optimal', kmSaved: Math.max(0, Math.round(kmSaved * 10) / 10) }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    let jobsReassigned = 0
    for (const [techId, stops] of perTechStops) {
      for (const stop of stops) {
        const previousTechId = previousTechnicianByJob.get(stop.id)
        await supabase.from('jobs').update({
          technician_id: techId,
          route_sequence: stop.sequence,
          estimated_arrival_at: stop.estimatedArrival,
        }).eq('id', stop.id)

        if (previousTechId !== techId) {
          jobsReassigned++
          supabase.functions.invoke('send-job-assignment-sms', {
            body: { jobId: stop.id, technicianId: techId, previousTechnicianId: previousTechId || undefined },
          }).catch(() => {})
          const job = jobsById.get(stop.id)
          const tech = technicians.find(t => t.id === techId)
          supabase.functions.invoke('run-custom-workflows', {
            body: { businessId, event: 'job.assigned', payload: { client_name: job?.client_name, technician_name: tech?.name } },
          }).catch(() => {})
        }
      }
    }

    const roundedKmSaved = Math.round(kmSaved * 10) / 10
    await supabase.from('businesses').update({ total_km_saved: (business.total_km_saved || 0) + roundedKmSaved }).eq('id', businessId)

    supabase.rpc('record_agent_run', { fn_name: 'optimize-fleet-day', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({
      success: true,
      techniciansOptimized: perTechStops.size,
      jobsReassigned,
      jobsSequenced: jobs.length,
      kmSaved: roundedKmSaved,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('optimize-fleet-day error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'optimize-fleet-day', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
