// Supabase Edge Function: send-growth-message
// NOT scheduled — called exactly once, synchronously, when a business owner
// clicks "Approve & Send" on an outreach_sms draft in the dispatcher's
// Marketing tab. Sends the pre-written, already-reviewed message to every
// recipient stored on that draft (pulled from the business's own leads
// table by generate-growth-drafts — never a purchased/scraped list). Like
// launch-ad-campaign, this never runs on its own initiative — only on a
// direct human click.
// Deploy with: supabase functions deploy send-growth-message
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
      .from('marketing_drafts')
      .select('*')
      .eq('id', draftId)
      .single()
    if (draftErr || !draft) throw new Error('Draft not found')
    if (draft.type !== 'outreach_sms') throw new Error('This draft is not an outreach message')
    if (draft.status !== 'pending') throw new Error(`Draft already ${draft.status} — refusing to send twice`)
    if (!draft.body_text) throw new Error('Draft has no message body')

    // Atomically claim the draft before sending any real SMS — the check
    // above alone is a time-of-check/time-of-use race (two rapid clicks, or
    // a retried request, could both pass it before either writes a new
    // status). This conditional update only succeeds for whichever request
    // gets there first; a second concurrent request sees 0 rows affected
    // and bails out before ever messaging a single recipient.
    const { data: claimed, error: claimErr } = await supabase
      .from('marketing_drafts')
      .update({ status: 'sending' })
      .eq('id', draftId)
      .eq('status', 'pending')
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) throw new Error('Draft already being sent — refusing to send twice')

    const recipients: { name?: string; phone?: string }[] = draft.recipients || []
    let sent = 0
    let failed = 0

    try {
      if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        for (const r of recipients) {
          if (!r.phone) { failed++; continue }
          let phone = r.phone.replace(/\s/g, '')
          if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
          if (!phone.startsWith('+')) phone = '+61' + phone

          const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
            method: 'POST',
            headers: {
              'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: draft.body_text }).toString(),
          }).catch(err => { console.error('send-growth-message: SMS failed', err); return null })

          if (res) {
            const result = await res.json().catch(() => ({}))
            if (!result.error_code) sent++
            else failed++
          } else {
            failed++
          }
        }
      } else {
        throw new Error('Twilio secrets not configured')
      }
    } catch (sendErr) {
      // Claimed the draft ('sending') but never finished — revert to
      // 'failed' rather than stranding it in 'sending' forever with no
      // retry path (the pending-status check above would block a retry).
      await supabase.from('marketing_drafts').update({ status: 'failed', error: sendErr.message, reviewed_at: new Date().toISOString() }).eq('id', draftId)
      throw sendErr
    }

    await supabase.from('marketing_drafts').update({
      status: 'sent',
      reviewed_at: new Date().toISOString(),
    }).eq('id', draftId)

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({
        businessId: draft.business_id,
        text: `📣 Growth outreach sent: ${sent}/${recipients.length} messages delivered.`,
      }),
    }).catch(() => {})

    supabase.rpc('record_agent_run', { fn_name: 'send-growth-message', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, sent, failed, total: recipients.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-growth-message error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'send-growth-message', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
