// Supabase Edge Function: send-referral-code-sms
// NOT scheduled — invoked fire-and-forget from DispatcherView.jsx's
// markInvoicePaid handler the moment an invoice is marked paid (same
// invocation pattern as sync-technician-billing being called
// fire-and-forget from the frontend). Paid-Invoice Referral Loop: a client
// who just paid is the best moment to ask for a referral. Generates a
// short referral code for the invoice (once — idempotent, see below) and
// texts it to the client with a plain, no-pressure "share this with a
// friend" message. This is the same "acknowledgment-tier nudge" scope as
// nurture-stale-leads/retention-checkin — a single, low-stakes thank-you
// text, not a marketing campaign, so it does not need the Growth pillar's
// human-approval gate.
// Deploy with: supabase functions deploy send-referral-code-sms
//
// Required secrets: same Twilio secrets as the other SMS functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// Same alphabet/approach as src/utils.js generatePin()/generateReferralCode()
// — reimplemented here since edge functions can't import from src/.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
function generateReferralCode(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  let code = ''
  for (let i = 0; i < 6; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  return code
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { invoiceId } = await req.json()
    if (!invoiceId) throw new Error('invoiceId is required')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('id, business_id, client_name, client_phone, referral_code, businesses(name)')
      .eq('id', invoiceId)
      .single()
    if (error || !invoice) throw new Error('Invoice not found')

    // Idempotent: a referral_code already existing means this invoice was
    // already processed by this function on an earlier "mark paid" click —
    // don't generate a new code or send a second SMS.
    if (invoice.referral_code) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'referral code already exists' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const code = generateReferralCode()
    await supabase.from('invoices').update({ referral_code: code }).eq('id', invoiceId)

    if (!invoice.client_phone) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no client phone on file' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    const bizName = (invoice as any).businesses?.name || 'us'

    let smsOk = false
    if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
      let phone = invoice.client_phone.replace(/\s/g, '')
      if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
      if (!phone.startsWith('+')) phone = '+61' + phone

      const message = `Thanks for your business, ${invoice.client_name || ''}! If you know anyone who needs ${bizName}, give them your code ${code} — just mention it when they get in touch.`.trim()

      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: message }).toString(),
      }).catch(err => { console.error('send-referral-code-sms: SMS failed', err); return null })

      if (res) {
        const result = await res.json().catch(() => ({}))
        smsOk = !result.error_code
      }
    }

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({
        businessId: invoice.business_id,
        text: smsOk
          ? `🤝 Referral code ${code} sent to *${invoice.client_name || 'client'}* after payment.`
          : `🤝 Referral code ${code} generated for *${invoice.client_name || 'client'}* but the SMS didn't send (check Twilio config / phone number).`,
      }),
    }).catch(() => {})

    return new Response(JSON.stringify({ success: true, code, smsSent: smsOk }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-referral-code-sms error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
