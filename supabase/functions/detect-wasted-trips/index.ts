// Supabase Edge Function: detect-wasted-trips
// Autonomous agent, run every ~15 minutes via pg_cron (see
// supabase_schema.sql) — the fastest cron cadence in this app, chosen to
// roughly match the technician GPS push interval (see TechnicianView.jsx,
// GPS_INTERVAL_MS) so a wasted trip can be caught same-day.
// Wasted-Trip / No-Show Proof Agent — reuses the existing
// technician_locations GPS breadcrumb trail (no new location tracking is
// added). Looks for a job that's still 'scheduled' (never moved to
// 'active'/'complete') where the assigned technician was nonetheless
// recorded within ~150m of the client's address more than 15 minutes ago.
// That combination is decent evidence of "we showed up, nobody was there /
// job never got kicked off" — a wasted trip.
//
// On a match: stamps jobs.no_show_detected_at (also the throttle, so a job
// is only ever flagged once), sends ONE client-facing SMS offering to
// reschedule (Twilio, same pattern as nurture-stale-leads), and pings the
// business's Slack with the geotagged evidence so the dispatcher has proof
// on hand if the client disputes being told nobody showed up.
//
// Also runs a second, unrelated check each run (Phase 3): a same-calendar-
// date job-overload heuristic per technician, writing anomalies to
// agent_insights — see the "Scheduling-conflict heuristic" comment further
// down for exactly what it can and can't detect given the current schema.
//
// Deploy with: supabase functions deploy detect-wasted-trips
// Required secrets: same Twilio secrets as the other SMS functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const ARRIVAL_RADIUS_KM = 0.15 // ~150 metres
const MIN_DWELL_MINUTES = 15

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'detect-wasted-trips').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    const twilio = { sid: TWILIO_SID, token: TWILIO_TOKEN, from: TWILIO_FROM }

    const dwellCutoff = new Date(Date.now() - MIN_DWELL_MINUTES * 60 * 1000).toISOString()

    const { data: candidateJobs, error } = await supabase
      .from('jobs')
      .select('id, business_id, technician_id, client_name, client_phone, client_lat, client_lng, businesses(name)')
      .eq('status', 'scheduled')
      .is('no_show_detected_at', null)
      .not('technician_id', 'is', null)
      .not('client_lat', 'is', null)
      .not('client_lng', 'is', null)
    if (error) throw error

    let detected = 0

    for (const job of candidateJobs || []) {
      const { data: pings, error: pingErr } = await supabase
        .from('technician_locations')
        .select('lat, lng, recorded_at')
        .eq('job_id', job.id)
        .lt('recorded_at', dwellCutoff)
        .order('recorded_at', { ascending: false })
        .limit(50)
      if (pingErr) { console.error('detect-wasted-trips: location fetch failed', pingErr); continue }
      if (!pings || pings.length === 0) continue

      const wasOnSite = pings.some(p => haversineKm(p.lat, p.lng, job.client_lat!, job.client_lng!) <= ARRIVAL_RADIUS_KM)
      if (!wasOnSite) continue

      const detectedAt = new Date().toISOString()
      await supabase.from('jobs').update({ no_show_detected_at: detectedAt }).eq('id', job.id)
      detected++

      const bizName = (job as any).businesses?.name || 'the business'
      if (job.client_phone) {
        const message = `Hi ${job.client_name || ''}, this is ${bizName} — our technician was on-site for your job but we weren't able to get it started. No charge for the trip. Reply here or call us to reschedule at a time that works.`.trim()
        const smsOk = await sendSms(twilio, job.client_phone, message)
        if (smsOk) await supabase.from('jobs').update({ no_show_reschedule_sms_sent_at: detectedAt }).eq('id', job.id)
      }

      await notifySlack(supabaseUrl, supabaseAnonKey, job.business_id,
        `🚚 Wasted trip detected for job with *${job.client_name || 'unknown client'}* — technician GPS confirms on-site presence but the job never started. Reschedule SMS sent to the client. Geotagged proof: technician_locations, job_id ${job.id}.`)
    }

    // ---------------------------------------------------------------------
    // Scheduling-conflict heuristic (Scheduling agent, added Phase 3)
    //
    // Honesty note on what this can and can't detect: `jobs` has a single
    // `scheduled_time` timestamp per job and NO duration/estimated_duration
    // column anywhere in the schema — the only job time field is
    // scheduled_time, there is no start/end window. That means there is no
    // way to detect a true "double-booking" (two jobs whose time windows
    // actually overlap) — the system doesn't know how long any job takes.
    //
    // The honest, buildable version implemented here instead: for each
    // technician, count how many currently 'scheduled'/'active' jobs with a
    // set scheduled_time fall on the same calendar date (today or a future
    // date — past/backlog dates are intentionally not scanned here). If a
    // technician has MORE THAN OVERLOAD_JOB_THRESHOLD jobs on one calendar
    // date, that's flagged as an anomaly — a conservative, fixed-threshold
    // signal that a technician's day is probably overloaded, NOT proof of
    // any specific double-booked time slot. Jobs with no scheduled_time are
    // excluded (there's no date to bucket them by).
    //
    // This lives inside detect-wasted-trips (rather than auto-assign-
    // technician) because it's this codebase's only scheduling-pillar
    // function on a tight (~15 min) cron cadence that scans across ALL
    // jobs/businesses — auto-assign-technician only fires once, per new
    // job, for auto-dispatch-enabled businesses, so it would miss
    // manually-assigned jobs and jobs added after the fact. Throttled per
    // technician+date via technicians.overload_alert_date so it only writes
    // one agent_insights row per technician per date, not every 15 minutes.
    const OVERLOAD_JOB_THRESHOLD = 6

    const todayStart = new Date()
    todayStart.setUTCHours(0, 0, 0, 0)

    const { data: upcomingJobs, error: upcomingErr } = await supabase
      .from('jobs')
      .select('id, business_id, technician_id, scheduled_time')
      .in('status', ['scheduled', 'active'])
      .not('technician_id', 'is', null)
      .not('scheduled_time', 'is', null)
      .gte('scheduled_time', todayStart.toISOString())

    if (upcomingErr) {
      console.error('detect-wasted-trips: overload check job fetch failed', upcomingErr)
    } else {
      const byTechDate: Record<string, { businessId: string; technicianId: string; date: string; count: number }> = {}
      for (const j of upcomingJobs || []) {
        if (!j.scheduled_time || !j.technician_id) continue
        const date = j.scheduled_time.slice(0, 10)
        const key = `${j.technician_id}|${date}`
        if (!byTechDate[key]) byTechDate[key] = { businessId: j.business_id, technicianId: j.technician_id, date, count: 0 }
        byTechDate[key].count++
      }

      for (const { businessId, technicianId, date, count } of Object.values(byTechDate)) {
        if (count <= OVERLOAD_JOB_THRESHOLD) continue

        const { data: tech } = await supabase
          .from('technicians')
          .select('id, name, overload_alert_date')
          .eq('id', technicianId)
          .single()
        if (!tech) continue
        if (tech.overload_alert_date === date) continue // already flagged this technician for this date

        await supabase.from('agent_insights').insert({
          agent: 'scheduling',
          insight_type: 'anomaly',
          summary: `${tech.name || 'A technician'} has ${count} jobs scheduled on ${date} — more than the ${OVERLOAD_JOB_THRESHOLD}-job/day heuristic this check uses (a fixed threshold, not a true time-overlap check — jobs have no duration data). Worth a manual look at whether the day is realistically doable.`,
          business_id: businessId,
          related_table: 'technicians',
          related_id: technicianId,
        }).then(() => {}, (insErr) => console.error('detect-wasted-trips: overload insight insert failed', insErr))

        await supabase.from('technicians').update({ overload_alert_date: date }).eq('id', technicianId)
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'detect-wasted-trips', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: (candidateJobs || []).length, detected }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('detect-wasted-trips error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'detect-wasted-trips', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Re-implemented inline (edge functions are deployed individually and
// can't import from src/) — same formula as src/utils.js haversineKm.
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

async function sendSms(
  twilio: { sid?: string; token?: string; from?: string },
  rawPhone: string,
  message: string
): Promise<boolean> {
  if (!twilio.sid || !twilio.token || !twilio.from) return false

  let phone = rawPhone.replace(/\s/g, '')
  if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
  if (!phone.startsWith('+')) phone = '+61' + phone

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${twilio.sid}:${twilio.token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: twilio.from, Body: message }).toString(),
  }).catch(err => { console.error('detect-wasted-trips: SMS failed', err); return null })

  if (!res) return false
  const result = await res.json().catch(() => ({}))
  return !result.error_code
}

async function notifySlack(supabaseUrl: string, supabaseAnonKey: string, businessId: string, text: string) {
  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ businessId, text }),
  }).catch(() => {})
}
