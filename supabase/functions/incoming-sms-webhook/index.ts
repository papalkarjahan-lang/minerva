// Supabase Edge Function: incoming-sms-webhook
// Set this as the "A MESSAGE COMES IN" webhook URL on a business's Twilio
// phone number, in the Twilio Console (Messaging configuration) — same
// opt-in, business-configures-it-themselves pattern as missed-call-webhook's
// "A CALL COMES IN" Voice webhook. Twilio calls this whenever someone texts
// that number.
//
// Found 2026-10-11: every client-facing SMS this product sends (completion,
// invoice, quote, review-request) invites a reply by simply being a text
// message, and nothing anywhere handled an incoming one — a real client
// reply had nowhere to land that a business owner would see in their normal
// Minerva workflow. Not a two-way conversation UI (a genuinely bigger
// feature) — this is the minimum that keeps a real reply from vanishing:
// correlate it to the client's own most recent active job by phone number
// and append it to that job's notes (same place/format a technician's own
// voice note already appears, DispatcherView.jsx's job detail view), plus a
// real-time Slack ping. If no matching active job is found, still Slack —
// just without a job to attach it to.
//
// Deploy with: supabase functions deploy incoming-sms-webhook --no-verify-jwt
// (must be reachable by Twilio without a Supabase auth header, same as
// missed-call-webhook/stripe-webhook)
//
// Required Supabase secrets: TWILIO_AUTH_TOKEN (signature validation only —
// this function never sends an SMS itself, so TWILIO_ACCOUNT_SID isn't
// needed), SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (same admin-client
// pattern as missed-call-webhook — Twilio's servers call this, not a
// browser, and there's deliberately no anon policy on jobs.notes writes
// from an unauthenticated context otherwise).
//
// Validates X-Twilio-Signature exactly like missed-call-webhook does (see
// that function's own comment for the algorithm) — the same signature
// scheme covers both Voice and Messaging webhooks.
//
// Idempotency: Twilio retries Messaging webhooks the same way it retries
// Voice ones. Claims MessageSid via processed_sms_sids (see
// supabase_schema_delta_incoming_sms_webhook.sql) before writing anything,
// same claim-first pattern already fixed into missed-call-webhook
// (2026-09-29) rather than repeating that TOCTOU gap in new code.
//
// Deliberately does NOT send an automatic reply — an empty TwiML response
// means Twilio does nothing further. Auto-replying to an unknown, possibly
// urgent message ("running late, come at 3 instead?") with a generic text
// could read as dismissive; better to just make sure a human sees it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone } from "../_shared/sms.ts"

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

// Identical algorithm to missed-call-webhook's own isValidTwilioSignature —
// duplicated rather than factored into _shared/ since that file is
// deliberately dependency-free (no Deno crypto imports), and this is the
// only other caller so far; worth sharing if a third one shows up.
async function isValidTwilioSignature(req: Request, form: FormData): Promise<boolean> {
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const twilioSignature = req.headers.get('X-Twilio-Signature')
  if (!authToken || !twilioSignature) return false

  const sortedKeys = [...form.keys()].sort()
  let data = req.url
  for (const key of sortedKeys) {
    data += key + (form.get(key)?.toString() ?? '')
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
  return computedSignature === twilioSignature
}

serve(async (req: Request) => {
  try {
    const form = await req.formData()

    if (!(await isValidTwilioSignature(req, form))) {
      console.error('incoming-sms-webhook: invalid or missing X-Twilio-Signature — rejecting request')
      return new Response('Invalid signature', { status: 403 })
    }

    const from = form.get('From')?.toString()
    const to = form.get('To')?.toString()
    const body = (form.get('Body')?.toString() || '').trim()
    const messageSid = form.get('MessageSid')?.toString()

    // Claim-first — see header comment. An INSERT either succeeds (this
    // request owns the message) or fails on a unique-violation (a
    // concurrent/retried delivery already claimed it).
    let alreadyProcessed = false
    if (messageSid) {
      const { error: claimError } = await supabaseAdmin
        .from('processed_sms_sids')
        .insert({ message_sid: messageSid })
      if (claimError) alreadyProcessed = true
    }

    if (from && body && !alreadyProcessed) {
      // Look up the business by its Twilio number — same lookup shape as
      // missed-call-webhook. A business on the shared platform fallback
      // number (no twilio_number set) can't be resolved this way; the
      // reply is still worth logging, just without a business to Slack.
      let businessId: string | null = null
      let businessName = 'a client'
      if (to) {
        const { data: biz } = await supabaseAdmin
          .from('businesses')
          .select('id, name')
          .eq('twilio_number', to)
          .maybeSingle()
        if (biz?.id) { businessId = biz.id; businessName = biz.name || businessName }
      }

      if (businessId) {
        // Correlate to the sender's own most recent active job in this
        // business, same "append a note, never overwrite" shape
        // TechnicianView.jsx's voice notes already use. Both sides of the
        // phone comparison go through the same formatAuPhone normalizer
        // this codebase already uses for outbound sends, since client_phone
        // may have been entered in national format (0412...) while Twilio's
        // From is always E.164 (+61412...).
        const normalizedFrom = formatAuPhone(from)
        const { data: jobs } = await supabaseAdmin
          .from('jobs')
          .select('id, notes, client_phone, client_name')
          .eq('business_id', businessId)
          .in('status', ['scheduled', 'active'])
          .order('scheduled_time', { ascending: false })
          .limit(50)

        const matchedJob = (jobs || []).find(j => j.client_phone && formatAuPhone(j.client_phone) === normalizedFrom)

        const entry = `[${new Date().toLocaleString('en-AU')}] SMS reply from client: ${body}`
        let attachedToJob = false
        if (matchedJob) {
          const updatedNotes = matchedJob.notes ? `${matchedJob.notes}\n${entry}` : entry
          const { error: noteErr } = await supabaseAdmin.from('jobs').update({ notes: updatedNotes }).eq('id', matchedJob.id)
          if (noteErr) console.error('incoming-sms-webhook: failed to append note to job', matchedJob.id, noteErr)
          else attachedToJob = true
        }

        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-slack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({
            businessId,
            text: `💬 SMS reply from ${matchedJob?.client_name || 'a client'} (${from}): "${body}"${attachedToJob ? ' — added to the job notes.' : ' — no matching active job found to attach it to; reply directly to their number.'}`,
          }),
        }).catch(() => {})

        await supabaseAdmin.rpc('record_agent_run', { fn_name: 'incoming-sms-webhook', status: 'ok' }).then(() => {}, () => {})
      } else {
        console.error(`incoming-sms-webhook: no business found for Twilio number ${to} — message from ${from} logged nowhere but the function log`)
        await supabaseAdmin.rpc('record_agent_run', { fn_name: 'incoming-sms-webhook', status: 'error', error_msg: `No business found for To=${to}` }).then(() => {}, () => {})
      }
    }

    // Empty TwiML — see header comment on why this deliberately doesn't
    // auto-reply.
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  } catch (err) {
    console.error('incoming-sms-webhook error:', err)
    try {
      await supabaseAdmin.rpc('record_agent_run', { fn_name: 'incoming-sms-webhook', status: 'error', error_msg: err.message })
    } catch (_) { /* never let health tracking break the response */ }
    // Still return valid (empty) TwiML so Twilio doesn't treat this as a
    // delivery failure and retry unboundedly.
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    })
  }
})
