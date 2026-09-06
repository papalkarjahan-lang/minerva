// Supabase Edge Function: create-billing-portal-session
// Closes a real gap: "Cancel anytime" is promised on the pricing page
// (LandingPage.jsx, Onboarding.jsx) and stripe-webhook has always saved
// stripe_customer_id onto `businesses` for exactly this purpose (see that
// function's own header comment), but no function or button anywhere ever
// actually opened the Stripe Customer Portal — meaning self-serve
// cancellation did not exist; a business could only cancel by asking
// support to do it manually via the Stripe dashboard.
//
// Creates a Stripe Billing Portal session for a business's existing
// stripe_customer_id and returns the hosted portal URL — the business
// owner is redirected there to manage/cancel their own subscription,
// exactly like create-checkout-session redirects to Stripe Checkout.
//
// Deploy with: supabase functions deploy create-billing-portal-session
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY   (same key used by create-checkout-session / stripe-webhook)
//   APP_URL             (same var used by create-checkout-session; portal's
//                        "return to" link after the customer is done)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { businessId } = await req.json()
    if (!businessId) throw new Error('businessId is required')

    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')
    const APP_URL = Deno.env.get('APP_URL')
    if (!STRIPE_KEY || !APP_URL) {
      throw new Error('Stripe environment variables not configured')
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )
    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('stripe_customer_id')
      .eq('id', businessId)
      .maybeSingle()
    if (bizErr) throw new Error(bizErr.message)
    if (!biz?.stripe_customer_id) {
      throw new Error('No Stripe customer on file yet for this business — this usually means checkout has not completed. Contact support if this seems wrong.')
    }

    const params = new URLSearchParams({
      'customer': biz.stripe_customer_id,
      'return_url': `${APP_URL}/dispatch/${businessId}`,
    })

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    })

    const session = await response.json()
    if (session.error) throw new Error(session.error.message)

    return new Response(JSON.stringify({ portalUrl: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  } catch (err) {
    console.error('create-billing-portal-session error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})
