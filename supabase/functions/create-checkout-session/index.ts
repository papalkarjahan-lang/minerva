// Supabase Edge Function: create-checkout-session
// Creates a Stripe Checkout Session for the Minerva subscription.
// Deploy with: supabase functions deploy create-checkout-session
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY             (sk_live_... from Stripe Dashboard)
//   STRIPE_PRICE_ID_STARTER       (price ID for $49/tech/month Starter plan)
//   STRIPE_PRICE_ID_STD           (price ID for $79/tech/month Standard plan)
//   STRIPE_PRICE_ID_PRO           (price ID for $119/tech/month Pro plan)
//   APP_URL                       (your production URL, e.g. https://minerva-green.vercel.app)
//
// Health wiring added 2026-09-23: this was registered in agent_functions
// but never called record_agent_run — a failure here (a real prospective
// business unable to sign up) was 100% invisible, same bug class as the
// sync-technician-billing/followup-outreach fix from 2026-09-22.
// Deliberately NOT given an `enabled`-check like most other gated
// functions: this is the top-of-funnel signup flow — disabling it would
// silently block ALL new business signups with no clear operational
// benefit.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { businessId, businessName, contactEmail, techCount, tier } = await req.json()

    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')
    const APP_URL = Deno.env.get('APP_URL')
    if (!STRIPE_KEY || !APP_URL) {
      throw new Error('Stripe environment variables not configured')
    }

    // Pick the Stripe price id for the chosen tier.
    let priceId: string | undefined
    if (tier === 'starter') {
      priceId = Deno.env.get('STRIPE_PRICE_ID_STARTER')
    } else if (tier === 'pro') {
      priceId = Deno.env.get('STRIPE_PRICE_ID_PRO')
    } else {
      // 'standard' or unrecognised tier — default to Standard, Minerva's
      // original/primary plan, rather than failing the checkout outright.
      priceId = Deno.env.get('STRIPE_PRICE_ID_STD')
    }

    if (!priceId) {
      throw new Error(`No Stripe price configured for tier "${tier}"`)
    }

    const params = new URLSearchParams({
      'mode': 'subscription',
      'payment_method_types[]': 'card',
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': String(techCount),
      'subscription_data[trial_period_days]': '7',
      'customer_email': contactEmail,
      'metadata[business_id]': businessId,
      'metadata[business_name]': businessName,
      'metadata[tech_count]': String(techCount),
      'success_url': `${APP_URL}/success?business_id=${businessId}&session_id={CHECKOUT_SESSION_ID}`,
      'cancel_url': `${APP_URL}/start`,
    })

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const session = await response.json()

    if (session.error) {
      throw new Error(session.error.message)
    }

    supabase.rpc('record_agent_run', { fn_name: 'create-checkout-session', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ sessionUrl: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })

  } catch (err) {
    console.error('create-checkout-session error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'create-checkout-session', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})
