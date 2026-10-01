// Supabase Edge Function: update-addon-billing
// Closes the last explicitly-documented outstanding item in
// DEPLOYMENT_CHECKLIST_PENDING.md: real Stripe billing for individual
// Minerva Max add-ons. Until this function existed, enableMaxAddon/
// disableMaxAddon in DispatcherView.jsx wrote straight to
// businesses.max_addons from the browser with no Stripe call at all (see
// the honest-scope note in supabase_schema_delta_minerva_max_tier.sql).
//
// Adds/removes a Stripe subscription item for one addon on a business's
// existing subscription (businesses.stripe_sub_id), mirroring the
// subscription-item add/remove pattern sync-technician-billing already
// uses for technician seats. Per-addon Stripe Price objects are supplied
// as one secret per addon key — see logic.ts's addonPriceEnvVar().
//
// Deliberately NOT wired into startMaxAddonTrial — trials stay a free,
// unbilled client-side preview by design (see src/maxAddons.js). Only
// enableMaxAddon/disableMaxAddon (the real paid toggle) call this.
//
// Deploy with: supabase functions deploy update-addon-billing
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY                 (same key used by create-checkout-session)
//   STRIPE_PRICE_ID_ADDON_<KEY>        one per addon in src/maxAddons.js's
//                                      MAX_ADDONS, e.g.
//                                      STRIPE_PRICE_ID_ADDON_AI_QUOTES.
//                                      Create these as new Stripe Prices in
//                                      the Dashboard — see this function's
//                                      own rollout note in
//                                      DEPLOYMENT_CHECKLIST_PENDING.md.
//
// Real financial side effect (adds/removes a live Stripe subscription
// item), so this gets the same treatment as sync-technician-billing: an
// agent_functions.enabled kill-switch check, and a caller-identity
// ownership check (not just verify_jwt, which the public anon key always
// satisfies — see SECURITY_NOTES.md).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"
import {
  addonPriceEnvVar,
  isValidAction,
  existingStripeItemId,
  buildEnabledPatch,
  buildEnabledNoopPatch,
  buildDisabledPatch,
} from "./logic.ts"

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
    const { data: fnState } = await supabaseAdmin.from('agent_functions').select('enabled').eq('name', 'update-addon-billing').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { businessId, addonKey, action } = await req.json()
    if (!businessId || !addonKey) {
      return new Response(JSON.stringify({ error: 'businessId and addonKey are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    if (!isValidAction(action)) {
      return new Response(JSON.stringify({ error: 'action must be "enable" or "disable"' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    const { data: business, error: bizErr } = await supabaseAdmin
      .from('businesses')
      .select('owner_user_id, contact_email, stripe_sub_id, max_addons, max_addon_stripe_items, subscription_tier')
      .eq('id', businessId)
      .maybeSingle()
    if (bizErr) throw new Error(bizErr.message)
    if (!business) {
      return new Response(JSON.stringify({ error: 'Business not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    // Ownership check — see header note. A legitimate dispatcher's session
    // JWT is already attached automatically by supabase.functions.invoke(),
    // so this adds no friction for real usage.
    const caller = await getAuthenticatedCaller(req, supabaseAdmin)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }
    if (!isOwnerOfBusiness(business, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      })
    }

    if (!business.stripe_sub_id) {
      throw new Error('No active subscription on file for this business yet — this usually means checkout has not completed. Contact support if this seems wrong.')
    }

    // stripe-webhook's customer.subscription.deleted handler sets
    // subscription_tier to 'cancelled' but deliberately leaves stripe_sub_id
    // in place (it's a historical record of which subscription existed) —
    // so the check above alone doesn't catch a cancelled business. Without
    // this, 'enable' would call stripe.subscriptionItems.create against a
    // subscription Stripe has already deleted and surface a raw Stripe API
    // error to the dispatcher instead of a clear one.
    if (action === 'enable' && business.subscription_tier === 'cancelled') {
      throw new Error("This business's subscription is cancelled — resubscribe before enabling a new add-on.")
    }

    let patch: Record<string, unknown>

    if (action === 'enable') {
      const existingItemId = existingStripeItemId(business, addonKey)
      if (existingItemId) {
        // Already billed for this addon — idempotent no-op on Stripe,
        // just make sure the flag itself is true.
        patch = buildEnabledNoopPatch(business, addonKey)
      } else {
        const priceId = Deno.env.get(addonPriceEnvVar(addonKey))
        if (!priceId) {
          throw new Error(`No Stripe price configured for addon "${addonKey}" (expected secret ${addonPriceEnvVar(addonKey)})`)
        }
        const item = await stripe.subscriptionItems.create({
          subscription: business.stripe_sub_id,
          price: priceId,
          quantity: 1,
          // Bill the new addon right away rather than waiting for the next
          // invoice, same as sync-technician-billing's seat-count updates.
          proration_behavior: 'always_invoice',
        })
        patch = buildEnabledPatch(business, addonKey, item.id)
      }
    } else {
      const existingItemId = existingStripeItemId(business, addonKey)
      if (existingItemId) {
        await stripe.subscriptionItems.del(existingItemId)
      }
      // No stored item id (e.g. a pre-billing trial-only addon) — nothing
      // to remove from Stripe, just flip the flag off.
      patch = buildDisabledPatch(business, addonKey)
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from('businesses')
      .update(patch)
      .eq('id', businessId)
      .select()
      .single()
    if (updateErr) throw new Error(updateErr.message)

    await supabaseAdmin.rpc('record_agent_run', { fn_name: 'update-addon-billing', status: 'ok' })
    return new Response(JSON.stringify({ business: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('update-addon-billing error:', err)
    try {
      await supabaseAdmin.rpc('record_agent_run', { fn_name: 'update-addon-billing', status: 'error', error_msg: err.message })
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})
