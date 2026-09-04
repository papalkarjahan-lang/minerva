// Supabase Edge Function: send-quote-sms
// Direct invocation: { quoteId }. Fired only from a dispatcher's explicit
// "Send to Client" click in DispatcherView (Quotes tab) — this is a
// Sales & Marketing-style outbound message, so like every other function in
// that pillar it never fires on its own; a human approves each send.
// Texts the client a link to their quote (QuoteView.jsx) and marks the
// quote 'sent'.
// Deploy with: supabase functions deploy send-quote-sms

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { quoteId } = await req.json()
    if (!quoteId) throw new Error('quoteId is required')

    const { data: quote, error } = await supabase.from('quotes').select('*, businesses(name)').eq('id', quoteId).maybeSingle()
    if (error || !quote) throw new Error('quote not found')
    if (!quote.client_phone) throw new Error('This quote has no client phone number on file')

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    const APP_URL = Deno.env.get('APP_URL') || ''
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    let phone = quote.client_phone.replace(/\s/g, '')
    if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
    if (!phone.startsWith('+')) phone = '+61' + phone

    const bizName = (quote as any).businesses?.name || 'the business'
    const link = `${APP_URL}/quote/${quote.id}`
    const message = `Hi ${quote.client_name || ''}, here's your quote from ${bizName} ($${Number(quote.total).toFixed(2)} inc. GST): ${link}`.trim()

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: message }).toString(),
    })
    const result = await res.json().catch(() => ({}))
    if (result.error_code) throw new Error(`Twilio rejected the send: ${result.error_message || result.error_code}`)

    await supabase.from('quotes').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', quoteId)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-quote-sms error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
