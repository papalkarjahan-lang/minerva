// Supabase Edge Function: send-invoice-sms
// Pro-tier on-site invoicing: triggered when a technician finishes building
// an invoice on job completion (TechnicianView.jsx). Texts the client a
// link to their invoice (InvoiceView.jsx) instead of handing over paper.
// Deploy with: supabase functions deploy send-invoice-sms
//
// Required Supabase secrets (same Twilio creds as the other SMS functions):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER  (your Twilio AU number, format: +61412345678)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

interface SMSPayload {
  clientPhone: string
  clientName: string
  businessName: string
  invoiceUrl: string
  total: number
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { clientPhone, clientName, businessName, invoiceUrl, total }: SMSPayload = await req.json()

    if (!clientPhone || !businessName || !invoiceUrl) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    let phone = clientPhone.replace(/\s/g, '')
    if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
    if (!phone.startsWith('+')) phone = '+61' + phone

    const totalStr = typeof total === 'number' ? `$${total.toFixed(2)}` : ''
    const message = `Hi ${clientName || 'there'}, here's your invoice from ${businessName}${totalStr ? ` (${totalStr})` : ''}: ${invoiceUrl}`

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
        body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: message }).toString(),
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
    console.error('send-invoice-sms error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
