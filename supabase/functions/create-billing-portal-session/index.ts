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
//
// Health wiring added 2026-09-23: record_agent_run only, deliberately no
// enabled-check — same risk-based scoping as create-checkout-session
// (a real billing-management flow; disabling it would block a business
// owner's own self-serve cancel/manage attempt with no alternative path
// besides contacting support). Registered in agent_functions for dashboard
// visibility only. See supabase_schema_delta_agent_registration_round2.sql
// for the new row.
//
// Ownership check added 2026-09-24 (Round 43): had zero caller-identity
// check at all — worse than the verify_jwt:false functions fixed earlier
// this round, since verify_jwt:true here was proven to add no real
// protection either (Supabase's public anon key, extractable from any
// browser bundle per this repo's own SECURITY_NOTES.md, is itself a valid
// JWT and satisfies the gateway's verify_jwt check trivially). Anyone who
// knew/guessed a businessId could get back a live Stripe Billing Portal
// session for a stranger's subscription — view payment methods/invoices,
// or cancel it outright. Fixed using the same isOwner pattern
// xero-oauth-connect already used for the identical forged-request risk.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

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
    const { businessId } = await req.json()
    if (!businessId) throw new Error('businessId is required')

    const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY')
    const APP_URL = Deno.env.get('APP_URL')
    if (!STRIPE_KEY || !APP_URL) {
      throw new Error('Stripe environment variables not configured')
    }

    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('owner_user_id, contact_email, stripe_customer_id')
      .eq('id', businessId)
      .maybeSingle()
    if (bizErr) throw new Error(bizErr.message)

    // Ownership check — see header note. A legitimate dispatcher's session
    // JWT is already attached automatically by supabase.functions.invoke(),
    // so this adds no friction for real usage.
    const caller = await getAuthenticatedCaller(req, supabase)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    if (!isOwnerOfBusiness(biz, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

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

    supabase.rpc('record_agent_run', { fn_name: 'create-billing-portal-session', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ portalUrl: session.url }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  } catch (err) {
    console.error('create-billing-portal-session error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'create-billing-portal-session', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    })
  }
})
