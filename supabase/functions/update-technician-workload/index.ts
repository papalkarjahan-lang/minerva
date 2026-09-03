// Supabase Edge Function: update-technician-workload
// Autonomous agent, run daily via pg_cron (see supabase_schema.sql).
// Fair-Rotation / Burnout Guard — recomputes two rolling 7-day signals per
// technician and writes them back onto the technicians row:
//   - rolling_week_hours: an ESTIMATE of hours "on the clock" in the
//     trailing 7 days, derived from technician_locations breadcrumbs —
//     for each of the last 7 calendar days, (latest recorded_at - earliest
//     recorded_at) for that technician that day, summed. This is not
//     exact payroll-grade timekeeping (it can't see gaps where GPS was
//     off, or count time spent stationary but genuinely on the clock) —
//     it's a burnout SIGNAL, not a wage/timesheet source of truth.
//   - rolling_emergency_job_count: number of jobs with urgency='emergency'
//     created for this technician in the trailing 7 days (jobs.urgency —
//     see the schema addendum comment on why this column was added).
//
// If a technician's rolling_week_hours crosses BURNOUT_HOURS_THRESHOLD and
// they haven't already been flagged in the last 7 days
// (technicians.burnout_flag_sent_at), sends ONE internal Slack alert to
// the business's dispatcher — never to the technician or a client. This is
// purely an internal visibility nudge; nothing here changes scheduling,
// pay, or job assignment automatically.
//
// Deploy with: supabase functions deploy update-technician-workload

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const BURNOUT_HOURS_THRESHOLD = 55 // hours in the trailing 7 days
const RE_ALERT_DAYS = 7

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'update-technician-workload').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const sevenDaysAgoIso = sevenDaysAgo.toISOString()

    const { data: technicians, error } = await supabase
      .from('technicians')
      .select('id, business_id, name, is_active, burnout_flag_sent_at')
      .eq('is_active', true)
    if (error) throw error

    let updated = 0, flagged = 0

    for (const tech of technicians || []) {
      // Hours estimate: pull the trailing 7 days of breadcrumbs, bucket by
      // calendar day (UTC — approximate, this is a signal not a timesheet),
      // sum (max - min) recorded_at per day.
      const { data: locations, error: locErr } = await supabase
        .from('technician_locations')
        .select('recorded_at')
        .eq('technician_id', tech.id)
        .gte('recorded_at', sevenDaysAgoIso)
        .order('recorded_at', { ascending: true })
      if (locErr) { console.error('update-technician-workload: locations fetch failed', locErr); continue }

      const byDay: Record<string, { min: number; max: number }> = {}
      for (const loc of locations || []) {
        const t = new Date(loc.recorded_at).getTime()
        const day = loc.recorded_at.slice(0, 10)
        if (!byDay[day]) byDay[day] = { min: t, max: t }
        else { byDay[day].min = Math.min(byDay[day].min, t); byDay[day].max = Math.max(byDay[day].max, t) }
      }
      let totalHours = 0
      for (const day in byDay) {
        totalHours += (byDay[day].max - byDay[day].min) / (1000 * 60 * 60)
      }
      totalHours = Math.round(totalHours * 10) / 10

      const { count: emergencyCount } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('technician_id', tech.id)
        .eq('urgency', 'emergency')
        .gte('created_at', sevenDaysAgoIso)

      await supabase.from('technicians').update({
        rolling_week_hours: totalHours,
        rolling_emergency_job_count: emergencyCount ?? 0,
      }).eq('id', tech.id)
      updated++

      const alreadyFlaggedRecently = tech.burnout_flag_sent_at
        && (Date.now() - new Date(tech.burnout_flag_sent_at).getTime()) < RE_ALERT_DAYS * 24 * 60 * 60 * 1000

      if (totalHours >= BURNOUT_HOURS_THRESHOLD && !alreadyFlaggedRecently) {
        await notifySlack(supabaseUrl, supabaseAnonKey, tech.business_id,
          `⚠️ *${tech.name}* has logged an estimated ${totalHours}h over the last 7 days (threshold ${BURNOUT_HOURS_THRESHOLD}h) — might be worth checking in or spreading the roster out a bit. (Internal note — not sent to the technician.)`)
        await supabase.from('technicians').update({ burnout_flag_sent_at: new Date().toISOString() }).eq('id', tech.id)
        flagged++
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'update-technician-workload', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, techniciansChecked: (technicians || []).length, updated, flagged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('update-technician-workload error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'update-technician-workload', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function notifySlack(supabaseUrl: string, supabaseAnonKey: string, businessId: string, text: string) {
  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ businessId, text }),
  }).catch(() => {})
}
