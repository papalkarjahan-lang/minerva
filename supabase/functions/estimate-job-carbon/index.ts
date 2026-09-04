// Supabase Edge Function: estimate-job-carbon
// Cron sweep (daily) — for each technician, chains together the client
// locations of jobs they completed that day (in completed_at order) and
// estimates the transit-related CO2-e for that day's run using a static
// published vehicle emissions factor. Writes one carbon_estimates row per
// technician-day, tagged to their last job of the day for reference.
//
// HONESTY NOTE — read before presenting this to a client or tender:
//  - This is a straight-line (haversine) distance between job stops, not
//    real road-network routing — actual driven distance will be higher.
//  - There is no material/embodied-carbon component. This build has no
//    live connection to any supplier's product database (see
//    SECURITY_NOTES.md / README for why — Reece/Bunnings/Middy's APIs
//    require a real commercial partnership Minerva doesn't have), so an
//    Environmental Product Declaration-based materials figure would be
//    fabricated. Only transit is estimated, and it's labelled as such.
//  - VEHICLE_FACTORS below are a static constant, not a live feed from the
//    Department of Climate Change's published National Greenhouse Accounts
//    (NGA) Factors workbook. Whoever operates this business should confirm
//    the current published figure before attaching a report to a real
//    tender, and update the constant — the factor_basis column exists
//    precisely so any confirmed estimate can be traced back to which
//    constant produced it.
// Deploy with: supabase functions deploy estimate-job-carbon

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// kg CO2-e per km, average city/highway — placeholder static reference,
// see header note. 'light_commercial' covers the typical trade-business
// service vehicle (ute/van).
const VEHICLE_FACTORS: Record<string, number> = {
  light_commercial: 0.25,
  passenger: 0.18,
}
const FACTOR_BASIS = 'Static reference constant (kg CO2-e/km, light commercial vehicle average) — confirm against the latest published Australian National Greenhouse Accounts (NGA) Factors workbook before citing in a client-facing or tender document.'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Minerva Max: carbon_estimate is a paid add-on — defense in depth
    // alongside the frontend gate (DispatcherView's Carbon Est. tab).
    // Resolve the set of businesses with the addon active/trialing first,
    // so the cron never computes/writes estimates for non-paying businesses.
    const { data: allBiz } = await supabase.from('businesses').select('id, max_addons, max_addon_trials')
    const activeBizIds = new Set(
      (allBiz || []).filter((b: any) =>
        b.max_addons?.carbon_estimate === true ||
        (b.max_addon_trials?.carbon_estimate?.ends_at && new Date(b.max_addon_trials.carbon_estimate.ends_at).getTime() > Date.now())
      ).map((b: any) => b.id)
    )

    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: rawCompletedJobs, error } = await supabase.from('jobs')
      .select('id, business_id, technician_id, client_lat, client_lng, completed_at')
      .eq('status', 'completed')
      .gte('completed_at', dayAgo)
      .not('technician_id', 'is', null)
      .not('client_lat', 'is', null)
      .not('client_lng', 'is', null)
      .order('completed_at', { ascending: true })
    if (error) throw error
    const completedJobs = (rawCompletedJobs || []).filter((j: any) => activeBizIds.has(j.business_id))

    // Group by technician
    const byTech = new Map<string, typeof completedJobs>()
    for (const job of completedJobs || []) {
      const key = job.technician_id as string
      if (!byTech.has(key)) byTech.set(key, [])
      byTech.get(key)!.push(job)
    }

    let estimatesCreated = 0
    for (const [, jobsForTech] of byTech) {
      if (jobsForTech.length < 2) continue // need at least 2 stops to have a "transit" distance to estimate

      let totalKm = 0
      for (let i = 1; i < jobsForTech.length; i++) {
        const a = jobsForTech[i - 1]
        const b = jobsForTech[i]
        totalKm += haversineKm(a.client_lat!, a.client_lng!, b.client_lat!, b.client_lng!)
      }
      if (totalKm <= 0) continue

      const factor = VEHICLE_FACTORS.light_commercial
      const estimatedKg = totalKm * factor
      const lastJob = jobsForTech[jobsForTech.length - 1]

      await supabase.from('carbon_estimates').insert({
        business_id: lastJob.business_id,
        job_id: lastJob.id,
        distance_km: Math.round(totalKm * 100) / 100,
        vehicle_type: 'light_commercial',
        estimated_kg_co2e: Math.round(estimatedKg * 100) / 100,
        factor_basis: FACTOR_BASIS,
      })
      estimatesCreated++
    }

    supabase.rpc('record_agent_run', { fn_name: 'estimate-job-carbon', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, techniciansEvaluated: byTech.size, estimatesCreated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('estimate-job-carbon error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'estimate-job-carbon', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
