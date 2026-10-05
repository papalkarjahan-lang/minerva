// Supabase Edge Function: notify-rebooking-request
// Public, called directly from TrackingView.jsx right after a client's
// self-serve "book me again" request inserts a leads row (same "browser
// hits a public edge function holding the real secret" pattern as
// notify-new-support-request/notify-new-enterprise-lead).
//
// WHY: TrackingView.jsx's rebooking form writes straight to `leads`
// (source='rebooking') on the reasoning that DispatcherView's realtime
// subscription on leads INSERT already covers it — true only while the
// dispatcher happens to have that tab open and visible at that exact
// moment, which for a trade business out doing jobs all day is the
// exception, not the rule. Every OTHER path that creates a leads row
// (ai-intake-chat, voice-intake-agent) sends an unconditional SMS+Slack
// notification in addition to the realtime update — this was the one
// leads-creating path that didn't, even though a past client asking to
// be booked again is exactly as hot a lead as a brand-new one, arguably
// hotter (they already know and trust this business). Same "default
// notification, don't rely on someone's tab being open" lens as
// respond-to-quote's fix one round earlier.
//
// Re-reads the row server-side with the service-role key rather than
// trusting anything the browser passes directly — same rule
// notify-new-support-request/notify-new-enterprise-lead already follow —
// so the only thing taken from the request body is the id of a row that
// was just actually inserted through the real insert policy.
//
// No ownership/caller-identity check: leads has a wide-open anon
// SELECT/INSERT policy by design (same "unguessable id" model as
// businesses — needed by the tracking view, dispatcher view, and
// technician view with no login), so there's no stricter check to apply
// here that isn't already implied by knowing a real lead id. Claimed
// once via a new rebooking_notified_at column before sending (see
// supabase_schema_delta_rebooking_notify.sql), so calling this twice for
// the same row — a retry, or the client re-opening the page — sends at
// most one notification ever.
//
// Deploy with: supabase functions deploy notify-rebooking-request

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendTwilioSms } from "../_shared/twilioSms.ts"
import { notifySlack } from "../_shared/notifySlack.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'notify-rebooking-request').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const body = await req.json().catch(() => ({}))
    const leadId: string | null = body.leadId || null
    if (!leadId) {
      return new Response(JSON.stringify({ error: 'leadId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('id, business_id, client_name, client_phone, suburb, job_description, source, businesses(contact_phone)')
      .eq('id', leadId)
      .maybeSingle()

    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    // Defence in depth — this function is specifically for the rebooking
    // path. A caller presenting some other lead's id just gets a no-op
    // rather than spamming a notification for an unrelated capture path
    // that already notifies through its own originating function.
    if (lead.source !== 'rebooking') {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'not a rebooking lead' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Atomically claim before sending — see header note.
    const { data: claimed, error: claimErr } = await supabase
      .from('leads')
      .update({ rebooking_notified_at: new Date().toISOString() })
      .eq('id', leadId)
      .is('rebooking_notified_at', null)
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'already notified' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const text = `🔁 Repeat booking request: *${lead.client_name || 'A past client'}* (${lead.suburb || 'no suburb given'}) wants to book again. ${lead.job_description || ''}`.trim()
    const bizPhone = (lead as any).businesses?.contact_phone
    if (bizPhone) {
      sendTwilioSms(
        { sid: Deno.env.get('TWILIO_ACCOUNT_SID'), token: Deno.env.get('TWILIO_AUTH_TOKEN'), from: Deno.env.get('TWILIO_PHONE_NUMBER') },
        bizPhone,
        text.replace(/[*_]/g, ''),
        'notify-rebooking-request'
      ).catch(() => {})
    }
    notifySlack(supabaseUrl, supabaseServiceKey, lead.business_id, text).catch(() => {})

    supabase.rpc('record_agent_run', { fn_name: 'notify-rebooking-request', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('notify-rebooking-request error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'notify-rebooking-request', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
