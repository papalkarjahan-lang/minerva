// Supabase Edge Function: sync-technician-billing
// Recalculates how many technicians are actually "detected" for a business
// (active AND have opened their tracking link on a phone at least once —
// i.e. last_seen is set) and updates the Stripe subscription quantity to
// match, so a business is billed for technicians actually using the app
// rather than a headcount typed into a form at signup.
//
// Called from TechnicianView.jsx the first time a technician's phone
// successfully pushes a GPS location. Safe to call repeatedly/redundantly —
// it always recomputes the full count from the database rather than
// incrementing, so it's self-correcting if calls are missed or duplicated.
//
// Deploy with: supabase functions deploy sync-technician-billing
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY         (same key used by create-checkout-session)
//   SUPABASE_URL              (auto-provided in Edge Function runtime)
//   SUPABASE_SERVICE_ROLE_KEY (needed to update businesses.stripe_sub_item_id
//                              is NOT written here, only read — but counting
//                              technicians and reading the business row still
//                              goes through RLS-safe anon-equivalent access;
//                              service role used for consistency with the
//                              other Stripe-touching functions)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { businessId } = await req.json()
    if (!businessId) {
      return new Response(JSON.stringify({ error: 'Missing businessId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: business, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('stripe_sub_item_id, subscription_tier')
      .eq('id', businessId)
      .single()
    if (bizErr || !business) {
      return new Response(JSON.stringify({ error: 'Business not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // No paid subscription to update yet (still mid-onboarding before Stripe
    // webhook has landed, or the sub was cancelled) — nothing to do, and not
    // an error, since this gets called opportunistically from every phone.
    if (!business.stripe_sub_item_id || business.subscription_tier === 'cancelled') {
      return new Response(JSON.stringify({ skipped: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { count, error: countErr } = await supabaseAdmin
      .from('technicians')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true)
      .not('last_seen', 'is', null)
    if (countErr) throw countErr

    // Stripe subscription item quantity must be at least 1.
    const quantity = Math.max(1, count ?? 1)

    const item = await stripe.subscriptionItems.update(business.stripe_sub_item_id, {
      quantity,
      // Bill the difference right away rather than waiting for the next
      // invoice, so adding a technician mid-cycle charges for them promptly.
      proration_behavior: 'always_invoice',
    })

    return new Response(JSON.stringify({ quantity: item.quantity }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })

  } catch (err) {
    console.error('sync-technician-billing error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
