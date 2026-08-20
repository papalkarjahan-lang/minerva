// Supabase Edge Function: missed-call-webhook
// Set this as the "A CALL COMES IN" (Voice) webhook URL on a business's
// Twilio phone number, in the Twilio Console. Twilio calls this whenever
// someone dials that number and the call isn't answered / is rejected /
// goes to voicemail (Minerva has no real call-routing/PBX system yet, so
// this is a simple "catch the missed call and text them back" responder,
// not a live dispatcher call-forward).
//
// Deploy with: supabase functions deploy missed-call-webhook --no-verify-jwt
// (must be reachable by Twilio without a Supabase auth header, same as
// stripe-webhook)
//
// Required Supabase secrets:
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER        (fallback "From" for the auto-reply SMS if a
//                                business-specific twilio_number isn't found)
//   SUPABASE_URL               (auto-provided in Edge Function runtime)
//   SUPABASE_SERVICE_ROLE_KEY  (needed to read businesses.twilio_number —
//                                there is deliberately no anon SELECT policy
//                                added for this; this function isn't a
//                                browser client, it's called by Twilio's
//                                servers, so it uses the same admin client
//                                pattern as stripe-webhook)
//
// Known limitation (see SECURITY_NOTES.md): this endpoint does not yet
// validate the X-Twilio-Signature header, so in principle anyone who
// discovers the URL could POST a fake "missed call" and trigger an SMS
// send. Twilio signs every webhook request; validating that signature is
// the standard hardening step (mirrors how stripe-webhook validates
// Stripe's signature) but has been left as documented follow-up work
// rather than blocking this feature — the worst case today is nuisance
// SMS sends via the Twilio account, not any customer data exposure.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

function escapeXml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

serve(async (req: Request) => {
  try {
    // Twilio posts application/x-www-form-urlencoded params, not JSON.
    const form = await req.formData()
    const from = form.get('From')?.toString() // caller's number
    const to = form.get('To')?.toString()     // the business's Twilio number

    // Look up the business by its Twilio number using the service_role key
    // (no anon SELECT policy exposes twilio_number for this — see notes above).
    let businessName = 'us'
    if (to) {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('name')
        .eq('twilio_number', to)
        .maybeSingle()
      if (biz?.name) businessName = biz.name
    }

    // Fire the outbound "we missed you" SMS to the caller, best-effort.
    // A failure here shouldn't stop us returning valid TwiML to Twilio.
    if (from) {
      try {
        const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
        const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
        const TWILIO_FROM = to || Deno.env.get('TWILIO_PHONE_NUMBER')

        if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
          const message = `Thanks for calling ${businessName}! We missed you - reply here or call back and we'll help book your job.`
          const smsResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
            {
              method: 'POST',
              headers: {
                'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({ To: from, From: TWILIO_FROM, Body: message }).toString(),
            }
          )
          const smsResult = await smsResponse.json()
          if (smsResult.error_code) {
            console.error(`missed-call-webhook: Twilio SMS error ${smsResult.error_code}: ${smsResult.message}`)
          }
        } else {
          console.error('missed-call-webhook: Twilio credentials not configured in Supabase secrets')
        }
      } catch (smsErr) {
        console.error('missed-call-webhook: failed to send auto-reply SMS:', smsErr)
      }
    }

    // Respond to the actual voice call with TwiML: a short spoken message,
    // then hang up. No <Dial> — there's no PBX/call-routing to forward to yet.
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Nicole">Thanks for calling ${escapeXml(businessName)}. We can't take your call right now - you'll receive a text message shortly with our booking link.</Say>
  <Hangup/>
</Response>`

    return new Response(twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' }
    })

  } catch (err) {
    console.error('missed-call-webhook error:', err)
    // Still return valid TwiML so the caller doesn't hit a raw error on the line.
    const fallbackTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Sorry, we can't take your call right now.</Say>
  <Hangup/>
</Response>`
    return new Response(fallbackTwiml, { status: 200, headers: { 'Content-Type': 'text/xml' } })
  }
})
