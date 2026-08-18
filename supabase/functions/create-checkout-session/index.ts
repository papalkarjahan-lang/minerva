// Supabase Edge Function: create-checkout-session
// Creates a Stripe Checkout Session for the Minerva subscription.
// Deploy with: supabase functions deploy create-checkout-session
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY     (sk_live_... from Stripe Dashboard)
//   STRIPE_PRICE_ID_STD   (price ID for $79/tech/month Standard plan)
//   STRIPE_PRICE_ID_PRO   (price ID for $119/tech/month Pro plan)
//   APP_URL               (your production URL, e.g. https://minervaops.com.au)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { businessId, businessName, contactEmail, techCount, dataSharing } = await req.json()

    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')
    const PRICE_ID = Deno.env.get('STRIPE_PRICE_ID_STD') // $79/tech standard
    const APP_URL = Deno.env.get('APP_URL')

    if (!STRIPE_KEY || !PRICE_ID || !APP_URL) {
      throw new Error('Stripe environment variables not configured')
    }

    // Apply data sharing discount: 15% off = $67/tech instead of $79
    // To implement: create a separate Stripe price ID for the discounted rate,
    // or apply a coupon. Simplest: use a separate price ID.
    const PRICE_ID_DISCOUNTED = Deno.env.get('STRIPE_PRICE_ID_STD_DISCOUNTED') // $67/tech
    const priceId = (dataSharing && PRICE_ID_DISCOUNTED) ? PRICE_ID_DISCOUNTED : PRICE_ID

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
      'metadata[data_sharing]': String(dataSharing),
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

    return new Response(JSON.stringify({ sessionUrl: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (err) {
    console.error('create-checkout-session error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
