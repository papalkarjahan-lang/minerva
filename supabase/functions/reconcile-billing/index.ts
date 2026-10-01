// Supabase Edge Function: reconcile-billing
// Autonomous agent, run daily via pg_cron. Safety net on top of
// sync-technician-billing (which fires opportunistically from a
// technician's phone on first GPS push): if that call was ever missed —
// phone offline on first launch, function cold-start error, etc. — the
// local "connected technician" count can silently drift from what
// Stripe is actually billing. This scans every business with an active
// Stripe subscription, compares local count vs Stripe's live quantity,
// and Slack-alerts (does NOT auto-correct — a human should look at *why*
// before changing what a client is billed) on any mismatch.
//
// Also checks Minerva Max add-on billing drift (added 2026-10-01): for any
// business with entries in max_addon_stripe_items, confirms each stored
// Stripe subscription item id still exists live on that business's
// subscription. stripe-webhook doesn't handle customer.subscription.
// updated, so a single add-on item removed directly in the Stripe
// Dashboard (rather than through update-addon-billing) would otherwise go
// undetected — the business keeps the add-on's max_addons flag (and the
// feature it gates) with nothing actually being billed. Same
// detect-and-alert-only philosophy as the seat-count check above.
// Deploy with: supabase functions deploy reconcile-billing
//
// Required secrets: STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY (same as
// sync-technician-billing). Optional: ANTHROPIC_API_KEY — if set, every
// mismatch also gets a one-sentence Claude best-guess at the likely cause
// (missed technician deactivation vs double-counted GPS ping vs Stripe-side
// seat change), written to `agent_insights` alongside a plain-English
// fallback summary that's ALWAYS written regardless of whether the key is
// present — this is the first function to actually write to that table.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  computeLocalQuantity,
  isMismatch,
  buildMismatchSlackMessage,
  buildMismatchFallbackSummary,
  buildReasoningPrompt,
  findStaleAddonItems,
  buildAddonDriftSlackMessage,
  buildAddonDriftFallbackSummary,
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
    const { data: fnState } = await supabaseAdmin.from('agent_functions').select('enabled').eq('name', 'reconcile-billing').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Self-heal businesses stuck with stripe_sub_id set but stripe_sub_item_id
    // still null — happens if stripe-webhook's one-shot fetch of the
    // subscription item id failed at checkout time (Stripe API hiccup).
    // Without this, such a business is silently excluded from the main
    // reconciliation query below forever (it filters on stripe_sub_item_id
    // NOT NULL) and never gets billed for technician seats at all.
    const { data: missingItemId } = await supabaseAdmin
      .from('businesses')
      .select('id, name, stripe_sub_id')
      .is('stripe_sub_item_id', null)
      .not('stripe_sub_id', 'is', null)
      .neq('subscription_tier', 'cancelled')
    let backfilled = 0
    for (const biz of missingItemId || []) {
      try {
        const sub = await stripe.subscriptions.retrieve(biz.stripe_sub_id)
        const itemId = sub.items.data[0]?.id
        if (itemId) {
          await supabaseAdmin.from('businesses').update({ stripe_sub_item_id: itemId }).eq('id', biz.id)
          backfilled++
        }
      } catch (err) {
        console.error(`reconcile-billing: backfill failed for ${biz.id}`, err)
      }
    }

    const { data: businesses, error } = await supabaseAdmin
      .from('businesses')
      .select('id, name, stripe_sub_id, stripe_sub_item_id, subscription_tier, max_addon_stripe_items')
      .not('stripe_sub_item_id', 'is', null)
      .neq('subscription_tier', 'cancelled')
    if (error) throw error

    let checked = 0
    let mismatches = 0
    let addonDrift = 0

    for (const biz of businesses || []) {
      checked++
      const { count } = await supabaseAdmin
        .from('technicians')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)
        .eq('is_active', true)
        .not('last_seen', 'is', null)

      const localQuantity = computeLocalQuantity(count ?? null)

      let stripeQuantity: number | null = null
      try {
        const item = await stripe.subscriptionItems.retrieve(biz.stripe_sub_item_id)
        stripeQuantity = item.quantity ?? null
      } catch (stripeErr) {
        console.error(`reconcile-billing: Stripe lookup failed for ${biz.id}`, stripeErr)
        continue
      }

      if (isMismatch(stripeQuantity, localQuantity)) {
        mismatches++
        await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-slack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
          body: JSON.stringify({
            businessId: biz.id,
            text: buildMismatchSlackMessage(biz.name, stripeQuantity as number, localQuantity),
          }),
        }).catch(() => {})

        const fallbackSummary = buildMismatchFallbackSummary(biz.name, stripeQuantity as number, localQuantity)
        const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')
        const summary = anthropicKey
          ? await draftReasoning(anthropicKey,
              buildReasoningPrompt(biz.name, stripeQuantity as number, localQuantity),
              fallbackSummary)
          : fallbackSummary

        await supabaseAdmin.from('agent_insights').insert({
          agent: 'finance',
          insight_type: 'anomaly',
          summary,
          business_id: biz.id,
          related_table: 'businesses',
          related_id: biz.id,
        }).then(() => {}, (insErr) => console.error('reconcile-billing: agent_insights insert failed', insErr))
      }

      // Minerva Max add-on billing drift check — see findStaleAddonItems's
      // header comment in logic.ts for why this exists (customer.
      // subscription.updated isn't handled by stripe-webhook, so a single
      // add-on item removed directly in Stripe goes otherwise undetected).
      if (biz.max_addon_stripe_items && Object.keys(biz.max_addon_stripe_items).length > 0 && biz.stripe_sub_id) {
        try {
          const items = await stripe.subscriptionItems.list({ subscription: biz.stripe_sub_id })
          const liveItemIds = new Set(items.data.map((item: { id: string }) => item.id))
          const staleKeys = findStaleAddonItems(biz.max_addon_stripe_items, liveItemIds)
          if (staleKeys.length > 0) {
            addonDrift++
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-slack`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
              body: JSON.stringify({
                businessId: biz.id,
                text: buildAddonDriftSlackMessage(biz.name, staleKeys),
              }),
            }).catch(() => {})

            await supabaseAdmin.from('agent_insights').insert({
              agent: 'finance',
              insight_type: 'anomaly',
              summary: buildAddonDriftFallbackSummary(biz.name, staleKeys),
              business_id: biz.id,
              related_table: 'businesses',
              related_id: biz.id,
            }).then(() => {}, (insErr) => console.error('reconcile-billing: agent_insights insert failed (addon drift)', insErr))
          }
        } catch (stripeErr) {
          console.error(`reconcile-billing: addon drift Stripe lookup failed for ${biz.id}`, stripeErr)
        }
      }
    }

    supabaseAdmin.rpc('record_agent_run', { fn_name: 'reconcile-billing', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, checked, mismatches, addonDrift, backfilled }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  } catch (err) {
    console.error('reconcile-billing error:', err)
    try {
      supabaseAdmin
        .rpc('record_agent_run', { fn_name: 'reconcile-billing', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    })
  }
})

// Asks Claude for a one-sentence best-guess explanation of a detected
// anomaly. Returns the plain-English fallback summary if the key is
// missing, the call fails, or the response looks empty/unusable — the
// agent_insights row is always written either way (see caller).
async function draftReasoning(apiKey: string, prompt: string, fallback: string): Promise<string> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return fallback
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    if (!text) return fallback
    return text
  } catch (err) {
    console.error('reconcile-billing: reasoning draft failed', err)
    return fallback
  }
}
