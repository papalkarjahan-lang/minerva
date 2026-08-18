// Supabase Edge Function: send-setup-sms
// Sent to each technician when the business owner completes onboarding.
// Deploy with: supabase functions deploy send-setup-sms

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { phone, name, businessName, techUrl } = await req.json()

    let formattedPhone = phone.replace(/\s/g, '')
    if (formattedPhone.startsWith('0')) formattedPhone = '+61' + formattedPhone.slice(1)

    const message = `Hi ${name}, you've been added to ${businessName}'s Minerva tracking system.\n\nOpen this link on your phone to start tracking:\n${techUrl}\n\nYou'll need to allow location access when prompted. Any issues, reply to this message.`

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: formattedPhone, From: TWILIO_FROM, Body: message }).toString(),
      }
    )

    const result = await response.json()
    return new Response(JSON.stringify({ success: true, sid: result.sid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
