// Supabase Edge Function: send-review-request-sms
// Direct invocation: { invoiceId }. Fired only from a dispatcher's explicit
// "Request Review" click in DispatcherView (Invoices tab, paid invoices
// only) — same human-approval-per-send rule as every other Sales &
// Marketing message in this codebase.
// Texts the client a link that redirects through track-review-click (so
// click-through can be measured) to the business's own Google review link.
// Requires businesses.google_review_link to be set (Settings) — returns an
// honest 400 rather than sending a broken link if it isn't.
// Deploy with: supabase functions deploy send-review-request-sms

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

    const { invoiceId } = await req.json()
    if (!invoiceId) throw new Error('invoiceId is required')

    const { data: invoice, error: invErr } = await supabase.from('invoices').select('*, businesses(*)').eq('id', invoiceId).maybeSingle()
    if (invErr || !invoice) throw new Error('invoice not found')
    if (!invoice.client_phone) throw new Error('This invoice has no client phone number on file')

    const business = (invoice as any).businesses
    // Minerva Max: review_loop is a paid add-on — defense in depth
    // alongside the frontend gate (see src/maxAddons.js / DispatcherView's
    // "Request Review" button), in case this is ever called directly.
    const addonActive = business?.max_addons?.review_loop === true ||
      (business?.max_addon_trials?.review_loop?.ends_at && new Date(business.max_addon_trials.review_loop.ends_at).getTime() > Date.now())
    if (!addonActive) {
      return new Response(JSON.stringify({ error: 'Review Request Loop is a Minerva Max add-on — enable it from the MAX tab first.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!business?.google_review_link) {
      return new Response(JSON.stringify({ error: 'No Google review link configured — set one in Settings first.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    const { data: reviewReq, error: reqErr } = await supabase.from('review_requests').insert({
      business_id: invoice.business_id,
      invoice_id: invoiceId,
      client_phone: invoice.client_phone,
    }).select().single()
    if (reqErr) throw reqErr

    let phone = invoice.client_phone.replace(/\s/g, '')
    if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
    if (!phone.startsWith('+')) phone = '+61' + phone

    const trackingLink = `${supabaseUrl}/functions/v1/track-review-click?id=${reviewReq.id}`
    const message = `Hi ${invoice.client_name || ''}, thanks for choosing ${business.name}! If you have a moment, we'd really appreciate a quick review: ${trackingLink}`.trim()

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

    await supabase.from('review_requests').update({ sent_at: new Date().toISOString() }).eq('id', reviewReq.id)

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-review-request-sms error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
