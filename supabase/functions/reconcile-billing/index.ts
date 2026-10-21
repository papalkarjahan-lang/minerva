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
import Stripe from "https://esm.sh/stripe@22?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chunk } from "../_shared/batch.ts"
import {
  computeLocalQuantity,
  isMismatch,
  buildMismatchSlackMessage,
  buildMismatchFallbackSummary,
  buildReasoningPrompt,
  findStaleAddonItems,
  buildAddonDriftSlackMessage,
  buildAddonDriftFallbackSummary,
  hasUntrackedSubscriptionItems,
  buildUntrackedItemsSlackMessage,
  buildUntrackedItemsFallbackSummary,
  pickSeatItemId,
} from "./logic.ts"

// Businesses are processed in bounded-concurrency batches, not fully
// sequentially — found live (scale-readiness pass, 2026-10-08) that the
// original fully-sequential loop, at hundreds of businesses each costing
// 2+ synchronous Stripe API round-trips (plus a Slack call and sometimes
// an Anthropic call on any mismatch), risked exceeding the Edge Function's
// wall-clock timeout partway through — silently never checking whichever
// businesses sorted later in the array that day, with no error or partial-
// failure signal, on the one function whose entire job is keeping Stripe
// billing numbers correct. 20 is a conservative concurrency cap — comfortably
// inside Stripe's own rate limits even accounting for every business in a
// batch hitting the add-on-drift branch's second Stripe call at once.
const RECONCILE_BATCH_SIZE = 20

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2026-07-29.dahlia',
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
      .select('id, name, stripe_sub_id, max_addon_stripe_items')
      .is('stripe_sub_item_id', null)
      .not('stripe_sub_id', 'is', null)
      .neq('subscription_tier', 'cancelled')
    let backfilled = 0
    for (const biz of missingItemId || []) {
      try {
        const sub = await stripe.subscriptions.retrieve(biz.stripe_sub_id)
        // pickSeatItemId, not items.data[0] — this business can already
        // have a real add-on item on this same subscription if they
        // enabled one through update-addon-billing before this backfill
        // ever ran (see that function's logic.ts header comment).
        const itemId = pickSeatItemId(sub.items.data, biz.max_addon_stripe_items)
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
    let untrackedItems = 0

    // Extracted so it can run inside Promise.all per batch below — same
    // exact logic/control-flow as the original sequential loop body
    // (including the early `return` where the original used `continue` on
    // a failed Stripe quantity lookup, skipping the add-on-drift checks for
    // that business but not any other), just returning flags instead of
    // incrementing the outer counters directly from inside a callback.
    async function reconcileOneBusiness(biz: {
      id: string
      name: string
      stripe_sub_id: string | null
      stripe_sub_item_id: string
      subscription_tier: string
      max_addon_stripe_items: Record<string, string> | null
    }): Promise<{ mismatch: boolean; addonDrift: boolean; untracked: boolean }> {
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
        return { mismatch: false, addonDrift: false, untracked: false }
      }

      let mismatch = false
      let addonDriftFound = false
      let untrackedFound = false

      if (isMismatch(stripeQuantity, localQuantity)) {
        mismatch = true
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
      // Fetches the live item list unconditionally now (not just when this
      // business has recorded add-ons) so the untracked-item count check
      // below can run for every business — see hasUntrackedSubscriptionItems's
      // header comment for why that one deliberately doesn't share the old
      // narrower gate. (Restructured 2026-10-03.)
      if (biz.stripe_sub_id) {
        try {
          const items = await stripe.subscriptionItems.list({ subscription: biz.stripe_sub_id })
          const liveItemIds = new Set(items.data.map((item: { id: string }) => item.id))

          if (biz.max_addon_stripe_items && Object.keys(biz.max_addon_stripe_items).length > 0) {
            const staleKeys = findStaleAddonItems(biz.max_addon_stripe_items, liveItemIds)
            if (staleKeys.length > 0) {
              addonDriftFound = true
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
          }

          if (hasUntrackedSubscriptionItems(items.data.length, biz.max_addon_stripe_items)) {
            const trackedCount = 1 + Object.keys(biz.max_addon_stripe_items || {}).length
            untrackedFound = true
            await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/notify-slack`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
              body: JSON.stringify({
                businessId: biz.id,
                text: buildUntrackedItemsSlackMessage(biz.name, items.data.length, trackedCount),
              }),
            }).catch(() => {})

            await supabaseAdmin.from('agent_insights').insert({
              agent: 'finance',
              insight_type: 'anomaly',
              summary: buildUntrackedItemsFallbackSummary(biz.name, items.data.length, trackedCount),
              business_id: biz.id,
              related_table: 'businesses',
              related_id: biz.id,
            }).then(() => {}, (insErr) => console.error('reconcile-billing: agent_insights insert failed (untracked items)', insErr))
          }
        } catch (stripeErr) {
          console.error(`reconcile-billing: addon drift Stripe lookup failed for ${biz.id}`, stripeErr)
        }
      }

      return { mismatch, addonDrift: addonDriftFound, untracked: untrackedFound }
    }

    for (const batch of chunk(businesses || [], RECONCILE_BATCH_SIZE)) {
      const results = await Promise.all(batch.map(reconcileOneBusiness))
      checked += results.length
      for (const r of results) {
        if (r.mismatch) mismatches++
        if (r.addonDrift) addonDrift++
        if (r.untracked) untrackedItems++
      }
    }

    supabaseAdmin.rpc('record_agent_run', { fn_name: 'reconcile-billing', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, checked, mismatches, addonDrift, untrackedItems, backfilled }), {
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
        model: 'claude-opus-5-5',
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
