// Supabase Edge Function: send-weather-reschedule-sms
// NOT scheduled — called exactly once, synchronously, when a business
// owner clicks "Approve & Send Reschedule SMS" on a pending
// weather_reschedule_drafts row in the Dispatcher view's Weather tab.
// Sends a plain, low-pressure reschedule prompt to the client for that
// one job. Like launch-ad-campaign / send-growth-message, this never runs
// on its own initiative — check-weather-risk only ever writes the draft;
// a human click is the only thing that can trigger an actual send.
// Deploy with: supabase functions deploy send-weather-reschedule-sms
//
// Required secrets: same Twilio secrets as the other SMS functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { draftId } = await req.json()
    if (!draftId) throw new Error('draftId is required')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')

    const { data: draft, error: draftErr } = await supabase
      .from('weather_reschedule_drafts')
      .select('*, jobs(id, client_name, client_phone, business_id)')
      .eq('id', draftId)
      .single()
    if (draftErr || !draft) throw new Error('Draft not found')
    if (draft.status !== 'pending') throw new Error(`Draft already ${draft.status} — refusing to send twice`)

    const job = (draft as any).jobs
    if (!job) throw new Error('Job for this draft no longer exists')
    if (!job.client_phone) throw new Error('This job has no client phone number on file')
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) throw new Error('Twilio secrets not configured')

    const message = `Hi ${job.client_name || ''}, tomorrow's forecast isn't looking great for your scheduled job (${draft.forecast_summary || 'weather risk flagged'}) and we'd rather reschedule than have it cut short or unsafe. Reply here or give us a call to pick a new time.`.trim()

    let phone = job.client_phone.replace(/\s/g, '')
    if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
    if (!phone.startsWith('+')) phone = '+61' + phone

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: message }).toString(),
    }).catch(err => { console.error('send-weather-reschedule-sms: SMS failed', err); return null })

    const result = res ? await res.json().catch(() => ({})) : { error_code: 'network_error' }
    const smsOk = res && !result.error_code

    await supabase.from('weather_reschedule_drafts').update({
      status: smsOk ? 'sent' : 'failed',
      reviewed_at: new Date().toISOString(),
    }).eq('id', draftId)

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({
        businessId: job.business_id,
        text: smsOk
          ? `⛈️ Weather reschedule SMS sent to *${job.client_name || 'client'}*.`
          : `⚠️ Weather reschedule SMS to *${job.client_name || 'client'}* failed to send — check the number on file.`,
      }),
    }).catch(() => {})

    if (!smsOk) throw new Error('SMS failed to send')

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-weather-reschedule-sms error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
