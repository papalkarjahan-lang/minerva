// Supabase Edge Function: check-service-credentials
// Autonomous agent, run daily via pg_cron. Closes a real blind spot in the
// existing Agent Operating System: test-agent-health flags a cron function
// as unhealthy only if it stops running entirely or THROWS repeatedly —
// but a function whose Twilio/Resend send fails never throws
// (sendTwilioSms catches the failure and returns false), so it still
// calls record_agent_run(status: 'ok') every single time regardless of
// whether the actual SMS/email went anywhere.
//
// Found live 2026-10-24, via the account owner's own inbox: Twilio's
// trial account expired 2026-09-18 with no subsequent upgrade (no
// payment-method or number-purchase email in the 5+ weeks since), and
// nothing in this codebase ever noticed or alerted on it, because every
// SMS-sending function "succeeded" from its own point of view the whole
// time. This function checks the actual EXTERNAL service, not just
// "did our own code crash":
//  - Twilio: a real, free, read-only call to the account-status endpoint
//    (GET /Accounts/{Sid}.json) — catches both missing/invalid
//    credentials AND a suspended/closed account, which a presence-only
//    check can't tell apart from a genuinely working one.
//  - Anthropic / Resend: presence-only (no free way to validate a key
//    without spending real tokens or sending a real email on every daily
//    check — not worth it for a pre-revenue, low-volume product; revisit
//    if real spend ever makes a cheap validation call worth it).
//
// Alert delivery deliberately mirrors test-agent-health's own proven
// pattern exactly (an agent_insights row + OPERATOR_EMAIL, both already
// live) rather than inventing a new channel. No new table: every run
// writes one agent_insights row per service either way
// ('service_health_ok' or 'service_health_alert' as the insight_type),
// which doubles as the history shouldAlert() reads to detect a
// transition — only alerts going INTO an unhealthy state (or the very
// first check ever, if already unhealthy), never repeats for an
// already-known, not-yet-fixed problem. See logic.ts for why.
//
// Deploy with: supabase functions deploy check-service-credentials

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { classifyTwilioAccountStatus, describePhoneNumberGap, shouldAlert, type ServiceCheckResult } from "./logic.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'check-service-credentials').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const results: ServiceCheckResult[] = []

    // --- Twilio: real account-status check, not just presence ---
    const twilioSid = Deno.env.get('TWILIO_ACCOUNT_SID')
    const twilioToken = Deno.env.get('TWILIO_AUTH_TOKEN')
    let twilioAccountHealthy = false
    if (!twilioSid || !twilioToken) {
      results.push({ service: 'twilio', healthy: false, detail: 'TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — SMS is a complete no-op.' })
    } else {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}.json`, {
        headers: { 'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`) },
      }).catch(() => null)
      const body = res ? await res.json().catch(() => ({})) : {}
      const twilioResult = classifyTwilioAccountStatus(!!res && res.ok, (body as any).status || null)
      twilioAccountHealthy = twilioResult.healthy
      results.push(twilioResult)
    }
    if (!Deno.env.get('TWILIO_PHONE_NUMBER')) {
      // When the account itself is healthy, check whether a real number is
      // already purchased and just never got wired into Supabase secrets —
      // a free, read-only call, so the alert can say exactly which number
      // to use instead of just "go buy one." See logic.ts's
      // describePhoneNumberGap for the full reasoning.
      let existingNumbers: string[] = []
      if (twilioAccountHealthy && twilioSid && twilioToken) {
        const numRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/IncomingPhoneNumbers.json?PageSize=5`, {
          headers: { 'Authorization': 'Basic ' + btoa(`${twilioSid}:${twilioToken}`) },
        }).catch(() => null)
        const numBody = numRes && numRes.ok ? await numRes.json().catch(() => ({})) : {}
        existingNumbers = ((numBody as any).incoming_phone_numbers || []).map((n: any) => n.phone_number).filter(Boolean)
      }
      results.push({ service: 'twilio_phone_number', healthy: false, detail: describePhoneNumberGap(twilioAccountHealthy, existingNumbers) })
    }

    // --- Presence-only checks (see header for why no live API call) ---
    if (!Deno.env.get('ANTHROPIC_API_KEY')) {
      results.push({ service: 'anthropic', healthy: false, detail: 'ANTHROPIC_API_KEY not set — AI intake scoring, quote drafting, and demand forecasting all run in their documented fallback/no-op mode.' })
    }
    if (!Deno.env.get('RESEND_API_KEY')) {
      results.push({ service: 'resend', healthy: false, detail: 'RESEND_API_KEY not set — every email this app sends (welcome, trial-ending, payment-failed, outreach) is a documented no-op.' })
    }

    let alerted = 0
    for (const result of results) {
      const { data: lastInsight } = await supabase
        .from('agent_insights')
        .select('insight_type')
        .eq('related_table', result.service)
        .in('insight_type', ['service_health_ok', 'service_health_alert'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const needsAlert = shouldAlert(lastInsight?.insight_type || null, result.healthy)

      await supabase.from('agent_insights').insert({
        agent: 'core',
        insight_type: result.healthy ? 'service_health_ok' : 'service_health_alert',
        summary: result.detail,
        related_table: result.service,
      })

      if (!needsAlert) continue

      console.error('check-service-credentials:', result.service, result.detail)

      const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
      if (operatorEmail) {
        fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            to: operatorEmail,
            subject: `[Minerva] ${result.service} isn't working`,
            html: `<p>${result.detail}</p><p>This checks the real external service, not just whether the secret is set — see check-service-credentials' own header for why that distinction matters. This alert won't repeat for the same unresolved problem; it'll fire again once this is fixed and later breaks again.</p>`,
          }),
        }).catch(err => console.error('check-service-credentials: operator email failed', err))
      }

      alerted++
    }

    supabase.rpc('record_agent_run', { fn_name: 'check-service-credentials', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, checked: results.length, unhealthy: results.filter(r => !r.healthy).length, alerted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('check-service-credentials error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'check-service-credentials', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
