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
//
// Fixed 2026-09-24 (Round 43 continued): had `verify_jwt:true` but, like
// create-billing-portal-session before this same fix, that alone verifies
// nothing about caller identity — the public anon key is itself a validly
// signed JWT (see SECURITY_NOTES.md's "verify_jwt is not a meaningful trust
// boundary" note). Took a bare `businessId` with zero ownership check, and
// unlike the SMS functions this one has a real *financial* side effect:
// `stripe.subscriptionItems.update(..., { proration_behavior: 'always_invoice' })`
// forces an immediate Stripe invoice on that business's real subscription.
// An unauthenticated caller with just a guessed/leaked businessId could
// force that proration/invoice to fire on a stranger's business at will.
// Fixed with a new `isOwnerOrTechnicianOfBusiness` check (this function's
// two real call sites are the business owner removing a technician in
// DispatcherView.jsx, and a technician's own phone connecting for the
// first time in TechnicianView.jsx — both need to pass, unlike the
// job-scoped `isOwnerOrAssignedTechnician` used elsewhere).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isOwnerOrTechnicianOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

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

  // Parsed once up front (rather than re-reading req.json() in the catch
  // block below, which would throw — a Request body can only be consumed
  // once) so the failure-alerting path still knows which business to
  // notify even if something below throws.
  let businessId: string | undefined
  try {
    // Registered in agent_functions (kill-switch row exists) but never
    // actually checked it or reported health — same "seeded but not wired
    // up" gap already fixed once for 5 other functions in
    // supabase_schema_delta_operational_fixes.sql, found again here.
    const { data: fnState } = await supabaseAdmin.from('agent_functions').select('enabled').eq('name', 'sync-technician-billing').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    ;({ businessId } = await req.json())
    if (!businessId) {
      return new Response(JSON.stringify({ error: 'Missing businessId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: business, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('stripe_sub_item_id, subscription_tier, owner_user_id, contact_email')
      .eq('id', businessId)
      .single()
    if (bizErr || !business) {
      return new Response(JSON.stringify({ error: 'Business not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Ownership check — see header note. A legitimate owner's or
    // technician's session JWT is already attached automatically by
    // supabase.functions.invoke(), so this adds no friction for real usage.
    const caller = await getAuthenticatedCaller(req, supabaseAdmin)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    const { data: roster } = await supabaseAdmin
      .from('technicians')
      .select('auth_user_id')
      .eq('business_id', businessId)
    if (!isOwnerOrTechnicianOfBusiness(business, roster, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
        status: 403,
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

    await supabaseAdmin.rpc('record_agent_run', { fn_name: 'sync-technician-billing', status: 'ok' })
    return new Response(JSON.stringify({ quantity: item.quantity }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })

  } catch (err) {
    console.error('sync-technician-billing error:', err)
    try {
      await supabaseAdmin.rpc('record_agent_run', { fn_name: 'sync-technician-billing', status: 'error', error_msg: err.message })
    } catch (_) { /* never let health tracking break the actual error response */ }

    // This function is fire-and-forget from TechnicianView.jsx (a failed
    // sync must never block GPS tracking), so a caught error here would
    // otherwise be invisible everywhere — no cron cadence to go stale on
    // (test-agent-health can't catch it), no frontend caller reading the
    // response. A wrong Stripe subscription quantity is a real, silent
    // revenue-impacting bug (business under/over-billed for technician
    // seats), so it's worth a best-effort Slack alert on that one
    // business, same fire-and-forget pattern every other background
    // function in this codebase already uses via notify-slack.
    try {
      if (businessId) {
        fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-slack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({
            businessId,
            text: `⚠️ *Billing sync failed*: technician subscription quantity could not be updated (${err.message || 'unknown error'}). Your Stripe billing may be out of sync with your active technician count until this is retried.`,
          }),
        }).catch(() => {})
      }
    } catch { /* best-effort only, never let alerting mask the real error */ }

    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
