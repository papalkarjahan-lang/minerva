// Supabase Edge Function: send-eta-sms
// Triggered when a technician comes within 2km of the client address.
// Deploy with: supabase functions deploy send-eta-sms
//
// Required Supabase secrets (set via Dashboard > Edge Functions > Secrets):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER  (your Twilio AU number, format: +61412345678)
//
// Health/kill-switch wiring added 2026-09-23: this was registered in
// agent_functions (seeded in supabase_schema_delta_agent_infra.sql) but
// never actually checked `enabled` or called `record_agent_run` — a
// failed send to a real client was 100% invisible everywhere, same bug
// class as the sync-technician-billing/followup-outreach fix from
// 2026-09-22.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone, buildEtaMessage } from "../_shared/sms.ts"

interface SMSPayload {
  clientPhone: string
  clientName: string
  techName: string
  businessName: string
  trackingUrl: string
}

serve(async (req: Request) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-eta-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const payload: SMSPayload = await req.json()
    const { clientPhone, clientName, techName, businessName, trackingUrl } = payload

    if (!clientPhone || !techName || !businessName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    const phone = formatAuPhone(clientPhone)
    const message = buildEtaMessage({ clientName, businessName, techName, trackingUrl })

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: TWILIO_FROM,
          Body: message,
        }).toString(),
      }
    )

    const result = await response.json()

    if (result.error_code) {
      throw new Error(`Twilio error ${result.error_code}: ${result.message}`)
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-eta-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, sid: result.sid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (err) {
    console.error('send-eta-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-eta-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
