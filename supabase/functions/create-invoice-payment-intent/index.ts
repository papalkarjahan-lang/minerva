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
//
// Health wiring added 2026-09-23: record_agent_run only, deliberately no
// enabled-check — same risk-based scoping as create-checkout-session
// (a real client payment flow; disabling it mid-flow could drop a real
// payment attempt with no retry path for the client). Registered in
// agent_functions for dashboard visibility only. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { validateInvoiceForPayment, centsFromDollars, shouldReuseExistingPaymentIntent, buildPaymentIntentDescription } from "./logic.ts"

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

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

    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, business_id, client_name, total, status, stripe_payment_intent_id')
      .eq('id', invoiceId)
      .single()
    if (invErr || !invoice) throw new Error('Invoice not found')

    const validation = validateInvoiceForPayment(invoice)
    if (!validation.ok) {
      return new Response(JSON.stringify({ error: validation.error }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Reuse an existing PaymentIntent for this invoice if one's already been
    // created (e.g. the client re-opened the pay page) instead of minting a
    // fresh one every time — Stripe amounts are in cents.
    let clientSecret: string | null = null
    let paymentIntentId = invoice.stripe_payment_intent_id

    if (paymentIntentId && paymentIntentId !== 'pending') {
      const existing = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
        headers: { 'Authorization': `Bearer ${STRIPE_KEY}` },
      })
      const existingPi = await existing.json()
      if (shouldReuseExistingPaymentIntent(existingPi)) {
        clientSecret = existingPi.client_secret
      } else {
        paymentIntentId = null // fall through and create a new one below
      }
    }

    if (!clientSecret) {
      // This invoice's public pay link has no login, so nothing stops it
      // being opened twice at once (two tabs/devices). Without a claim
      // here, two concurrent requests could both read stripe_payment_
      // intent_id as null, both mint a separate Stripe PaymentIntent, and
      // whichever DB write lands last silently discards the other PI's id
      // — if the client actually pays on the "lost" one, stripe-webhook's
      // exact-match update finds 0 rows and the invoice is stuck unpaid
      // forever with no alert, or (if both are paid) the client is
      // double-charged. Claim atomically first so only one request can
      // proceed to create a PaymentIntent for this invoice at a time.
      const claimUpdate = supabase.from('invoices').update({ stripe_payment_intent_id: 'pending' }).eq('id', invoice.id)
      const { data: claimed } = await (invoice.stripe_payment_intent_id
        ? claimUpdate.eq('stripe_payment_intent_id', invoice.stripe_payment_intent_id)
        : claimUpdate.is('stripe_payment_intent_id', null)
      ).select('id')

      if (!claimed || claimed.length === 0) {
        // Lost the race — another concurrent request is already creating
        // (or just created) a PaymentIntent for this invoice. Re-fetch and
        // try to reuse it rather than minting a second one.
        const { data: fresh } = await supabase.from('invoices').select('stripe_payment_intent_id').eq('id', invoice.id).maybeSingle()
        if (fresh?.stripe_payment_intent_id && fresh.stripe_payment_intent_id !== 'pending') {
          const existing = await fetch(`https://api.stripe.com/v1/payment_intents/${fresh.stripe_payment_intent_id}`, {
            headers: { 'Authorization': `Bearer ${STRIPE_KEY}` },
          })
          const existingPi = await existing.json()
          if (shouldReuseExistingPaymentIntent(existingPi)) clientSecret = existingPi.client_secret
        }
        if (!clientSecret) {
          return new Response(JSON.stringify({ error: 'Payment setup already in progress for this invoice — please try again in a few seconds.' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json', ...corsHeaders },
          })
        }
      } else {
        // We hold the claim — safe to create a new PaymentIntent.
        const amountCents = centsFromDollars(invoice.total)
        const params = new URLSearchParams({
          'amount': String(amountCents),
          'currency': 'aud',
          'automatic_payment_methods[enabled]': 'true',
          'metadata[invoice_id]': invoice.id,
          'metadata[business_id]': invoice.business_id,
          'description': buildPaymentIntentDescription(invoice.client_name),
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
        if (pi.error) {
          // Release the claim so a retry isn't stuck behind "pending" forever.
          await supabase.from('invoices').update({ stripe_payment_intent_id: invoice.stripe_payment_intent_id || null }).eq('id', invoice.id)
          throw new Error(pi.error.message)
        }

        clientSecret = pi.client_secret
        paymentIntentId = pi.id

        const { error: updateErr } = await supabase
          .from('invoices')
          .update({ stripe_payment_intent_id: paymentIntentId })
          .eq('id', invoice.id)
        if (updateErr) console.error('Failed to save stripe_payment_intent_id:', updateErr.message)
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'create-invoice-payment-intent', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ clientSecret }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('create-invoice-payment-intent error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'create-invoice-payment-intent', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
