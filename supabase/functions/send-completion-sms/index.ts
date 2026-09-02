// Supabase Edge Function: send-completion-sms
// Triggered when a technician marks a job complete (handleCompleteJob in
// TechnicianView.jsx). Sends the client a short "job's done" SMS.
// Deploy with: supabase functions deploy send-completion-sms
//
// Required Supabase secrets (set via Dashboard > Edge Functions > Secrets):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER  (your Twilio AU number, format: +61412345678)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

interface SMSPayload {
  clientPhone: string
  clientName: string
  techName: string
  businessName: string
  completedAt: string
}

serve(async (req: Request) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const payload: SMSPayload = await req.json()
    const { clientPhone, clientName, techName, businessName } = payload

    if (!clientPhone || !techName || !businessName) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // Format phone number to E.164 for Twilio
    // Converts 0412345678 -> +61412345678
    let phone = clientPhone.replace(/\s/g, '')
    if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
    if (!phone.startsWith('+')) phone = '+61' + phone

    const message = `Hi ${clientName}, ${techName} from ${businessName} has completed your job. Thank you for choosing us!`

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

    return new Response(JSON.stringify({ success: true, sid: result.sid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (err) {
    console.error('send-completion-sms error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
