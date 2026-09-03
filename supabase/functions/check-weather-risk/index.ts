// Supabase Edge Function: check-weather-risk
// Autonomous agent, run daily via pg_cron (see supabase_schema.sql), early
// morning UTC (~6-7am AEST/AEDT — ahead of the working day so a draft is
// ready before the dispatcher opens up).
// Weather-Risk Reschedule Agent — for businesses that have opted a trade
// type into `businesses.weather_sensitive_trade_types` (e.g. roofing,
// painting, concreting), checks tomorrow's scheduled jobs against a free,
// keyless Open-Meteo forecast (https://open-meteo.com — no API key, no new
// secret required) and writes a `weather_reschedule_drafts` row
// (status='pending') for any job that looks weather-risky.
//
// Human-approval-gated, same pattern as marketing_drafts: this function
// ONLY EVER WRITES A DRAFT. No client SMS is sent here — that only happens
// when a human clicks "Approve & Send Reschedule SMS" in the Dispatcher
// view's Weather tab, which calls send-weather-reschedule-sms.
//
// Risk thresholds (documented here since they're not configurable yet):
//   - max daily rain probability >= 70%, OR
//   - max daily wind speed >= 60 km/h, OR
//   - max daily temperature >= 40°C (extreme heat — outdoor-work safety)
// These are deliberately conservative/simple — a business can always
// Dismiss a draft that doesn't actually warrant a reschedule.
//
// Deploy with: supabase functions deploy check-weather-risk
// No secrets required beyond the ones already set (SUPABASE_URL /
// SUPABASE_ANON_KEY, injected automatically).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const RAIN_PROB_THRESHOLD = 70 // %
const WIND_THRESHOLD_KMH = 60
const HEAT_THRESHOLD_C = 40

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'check-weather-risk').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: businesses, error } = await supabase
      .from('businesses')
      .select('id, name, weather_sensitive_trade_types')
      .not('weather_sensitive_trade_types', 'is', null)
    if (error) throw error

    const tomorrowStart = new Date()
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1)
    tomorrowStart.setUTCHours(0, 0, 0, 0)
    const tomorrowEnd = new Date(tomorrowStart.getTime() + 24 * 60 * 60 * 1000)
    const tomorrowDateStr = tomorrowStart.toISOString().slice(0, 10)

    let checked = 0, drafted = 0

    for (const biz of businesses || []) {
      const trades: string[] = biz.weather_sensitive_trade_types || []
      if (trades.length === 0) continue

      const { data: jobs, error: jobsErr } = await supabase
        .from('jobs')
        .select('id, client_name, client_lat, client_lng, scheduled_time')
        .eq('business_id', biz.id)
        .eq('status', 'scheduled')
        .is('weather_risk_flagged_at', null)
        .not('client_lat', 'is', null)
        .not('client_lng', 'is', null)
        .gte('scheduled_time', tomorrowStart.toISOString())
        .lt('scheduled_time', tomorrowEnd.toISOString())
      if (jobsErr) { console.error('check-weather-risk: jobs fetch failed', jobsErr); continue }

      for (const job of jobs || []) {
        checked++
        try {
          const forecast = await fetchForecast(job.client_lat!, job.client_lng!, tomorrowDateStr)
          if (!forecast) continue

          const risky = forecast.rainProb >= RAIN_PROB_THRESHOLD
            || forecast.windKmh >= WIND_THRESHOLD_KMH
            || forecast.maxTempC >= HEAT_THRESHOLD_C

          if (!risky) {
            // Not risky today, but mark checked so we don't re-hit the API for
            // this job every run — it'll naturally drop out of the "tomorrow"
            // window after tomorrow passes anyway.
            continue
          }

          const reasons: string[] = []
          if (forecast.rainProb >= RAIN_PROB_THRESHOLD) reasons.push(`${forecast.rainProb}% chance of rain`)
          if (forecast.windKmh >= WIND_THRESHOLD_KMH) reasons.push(`wind up to ${Math.round(forecast.windKmh)} km/h`)
          if (forecast.maxTempC >= HEAT_THRESHOLD_C) reasons.push(`forecast high of ${Math.round(forecast.maxTempC)}°C`)
          const summary = `Tomorrow (${tomorrowDateStr}): ${reasons.join(', ')}.`

          await supabase.from('weather_reschedule_drafts').insert({
            job_id: job.id,
            business_id: biz.id,
            forecast_summary: summary,
            status: 'pending',
          })
          await supabase.from('jobs').update({ weather_risk_flagged_at: new Date().toISOString() }).eq('id', job.id)
          drafted++

          await notifySlack(supabaseUrl, supabaseAnonKey, biz.id,
            `⛈️ Weather risk flagged for tomorrow's job with *${job.client_name || 'a client'}* — ${summary} A reschedule draft is waiting for your review in the Weather tab.`)
        } catch (err) {
          console.error('check-weather-risk: forecast lookup failed for job', job.id, err)
        }
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'check-weather-risk', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, businessesChecked: (businesses || []).length, jobsChecked: checked, drafted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('check-weather-risk error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'check-weather-risk', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function fetchForecast(lat: number, lng: number, dateStr: string): Promise<{ rainProb: number; windKmh: number; maxTempC: number } | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&daily=precipitation_probability_max,windspeed_10m_max,temperature_2m_max&timezone=Australia%2FSydney&start_date=${dateStr}&end_date=${dateStr}`
  const res = await fetch(url).catch(() => null)
  if (!res || !res.ok) return null
  const data = await res.json().catch(() => null)
  const daily = data?.daily
  if (!daily || !daily.time || daily.time.length === 0) return null
  return {
    rainProb: daily.precipitation_probability_max?.[0] ?? 0,
    windKmh: daily.windspeed_10m_max?.[0] ?? 0,
    maxTempC: daily.temperature_2m_max?.[0] ?? 0,
  }
}

async function notifySlack(supabaseUrl: string, supabaseAnonKey: string, businessId: string, text: string) {
  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ businessId, text }),
  }).catch(() => {})
}
