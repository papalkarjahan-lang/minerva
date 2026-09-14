// Supabase Edge Function: create-invoice-payment-intent
// Client-click agent (like create-checkout-session) — fired only when a
// client opens the "Pay now" button on their InvoiceView. Never runs on its
// own initiative, never targets an invoice the caller didn't explicitly
// open. Creates a Stripe PaymentIntent for that one invoice's `total` and
// returns its client_secret so the browser can complete payment with
// Stripe.js/Stripe Elements — card details are entered directly into
// Stripe's own hosted iframe and never touch this function or Minerva's
// database. See supabase_schema_delta_invoice_payments.sql for the columns
// this writes/relies on, and stripe-webhook's payment_intent.succeeded
// handler for how the invoice actually gets marked paid.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY   (same key used by create-checkout-session)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-provided in Edge Function runtime)
//
// Deploy with the multipart /functions/deploy Supabase Management API
// (no CLI in this project — see minerva_supabase_function_deploy_method
// memory), verify_jwt should match create-checkout-session (this is a
// client-facing, no-login endpoint reached from InvoiceView's public link).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { invoiceId } = await req.json()
    if (!invoiceId) {
      return new Response(JSON.stringify({ error: 'Missing invoiceId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')
    if (!STRIPE_KEY) throw new Error('Stripe environment variables not configured')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, business_id, client_name, total, status, stripe_payment_intent_id')
      .eq('id', invoiceId)
      .single()
    if (invErr || !invoice) throw new Error('Invoice not found')

    if (invoice.status === 'paid') {
      return new Response(JSON.stringify({ error: 'Invoice is already paid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    if (!invoice.total || invoice.total <= 0) {
      return new Response(JSON.stringify({ error: 'Invoice has no payable amount' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Reuse an existing PaymentIntent for this invoice if one's already been
    // created (e.g. the client re-opened the pay page) instead of minting a
    // fresh one every time — Stripe amounts are in cents.
    let clientSecret: string | null = null
    let paymentIntentId = invoice.stripe_payment_intent_id

    if (paymentIntentId) {
      const existing = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}` },
      })
      const existingPi = await existing.json()
      if (existingPi && !existingPi.error && existingPi.status !== 'succeeded' && existingPi.status !== 'canceled') {
        clientSecret = existingPi.client_secret
      } else {
        paymentIntentId = null // fall through and create a new one below
      }
    }

    if (!clientSecret) {
      const amountCents = Math.round(Number(invoice.total) * 100)
      const params = new URLSearchParams({
        'amount': String(amountCents),
        'currency': 'aud',
        'automatic_payment_methods[enabled]': 'true',
        'metadata[invoice_id]': invoice.id,
        'metadata[business_id]': invoice.business_id,
        'description': `Minerva invoice${invoice.client_name ? ' — ' + invoice.client_name : ''}`,
      })

      const response = await fetch('https://api.stripe.com/v1/payment_intents', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STRIPE_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })
      const pi = await response.json()
      if (pi.error) throw new Error(pi.error.message)

      clientSecret = pi.client_secret
      paymentIntentId = pi.id

      const { error: updateErr } = await supabase
        .from('invoices')
        .update({ stripe_payment_intent_id: paymentIntentId })
        .eq('id', invoice.id)
      if (updateErr) console.error('Failed to save stripe_payment_intent_id:', updateErr.message)
    }

    return new Response(JSON.stringify({ clientSecret }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('create-invoice-payment-intent error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
