// Supabase Edge Function: stripe-webhook
// Receives Stripe events and persists stripe_customer_id / stripe_sub_id
// onto the matching businesses row. Without this, the Stripe Customer
// Portal self-serve cancellation promised on the pricing page has nothing
// to look up — the business's Stripe IDs are never saved anywhere after
// checkout.
//
// Deploy with: supabase functions deploy stripe-webhook --no-verify-jwt
// (must be reachable by Stripe without a Supabase auth header)
//
// After deploying, register the endpoint in Stripe Dashboard > Developers >
// Webhooks:
//   URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/stripe-webhook
//   Events to send: checkout.session.completed, customer.subscription.deleted,
//                    customer.subscription.updated (added 2026-10-05 — syncs
//                    subscription_tier when a business switches plans via the
//                    Customer Portal; see planSubscriptionUpdated's own comment),
//                    invoice.payment_failed, invoice.payment_succeeded,
//                    payment_intent.succeeded (needed only if the optional
//                    "Pay now" invoice flow — create-invoice-payment-intent —
//                    is used; see supabase_schema_delta_invoice_payments.sql),
//                    charge.dispute.created, charge.dispute.closed,
//                    charge.refunded (all 3 added 2026-10-03 — if this
//                    endpoint is already registered in Stripe from before,
//                    these need adding to its event list manually; Stripe
//                    does not backfill new event types onto an existing
//                    webhook endpoint automatically)
// Copy the signing secret into Supabase secrets as STRIPE_WEBHOOK_SECRET.
//
// Run supabase_schema_delta_payment_failed.sql once before relying on the
// invoice.payment_failed / invoice.payment_succeeded handling below — it adds
// the businesses.payment_failed_at column those two cases write to.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY       (same key used by create-checkout-session)
//   STRIPE_WEBHOOK_SECRET   (whsec_... from the Stripe webhook settings page)
//   SUPABASE_URL            (auto-provided in Edge Function runtime)
//   SUPABASE_SERVICE_ROLE_KEY (set manually — needed to bypass RLS and write
//                              stripe_customer_id/stripe_sub_id; the anon key
//                              cannot write these columns since no anon
//                              UPDATE policy exists on businesses by design)
//   OPERATOR_EMAIL (optional — your own email. If set, a failed payment
//                    sends you a heads-up via send-email; if unset, this
//                    step is a no-op, same as RESEND_API_KEY being unset)
//
// Health wiring added 2026-09-23: this was registered in agent_functions
// but never called record_agent_run — a failure here (real Stripe money
// events silently dropped) was 100% invisible, same bug class as the
// sync-technician-billing/followup-outreach fix from 2026-09-22.
// Deliberately NOT given an `enabled`-check like most other gated
// functions: silently dropping real Stripe financial events with no
// UI-exposed use case for pausing this specific webhook is too risky.
//
// Idempotency (added 2026-09-24, Round 44): Stripe explicitly documents
// that webhook deliveries can be retried (timeout, non-2xx response, or
// occasional duplicate delivery even on success) and recommends deduping
// by event.id. Every branch's own DB write here is itself idempotent
// (plain UPDATEs re-writing the same values), but checkout.session.
// completed and invoice.payment_failed each also fire a best-effort
// email as a side effect — a retried delivery would resend either email
// every time, unbounded. Fixed via processed_stripe_events (see
// supabase_schema_delta_stripe_webhook_idempotency.sql): checked right
// after signature verification (an already-processed event returns 200
// immediately, no branch re-run), and the row is only inserted after the
// event's branch completes without throwing, so a genuine failure
// (which still 500s, causing a legitimate Stripe retry) is correctly not
// marked as processed.
//
// Write-failure fix (2026-09-28): the claim in the paragraph above was
// only true once every branch's DB-write error actually threw. Until this
// fix, each branch did `if (error) console.error(...)` and then fell
// through to the processed-event insert and the 200 response regardless
// — so a real DB failure (transient error, RLS misconfiguration) still
// got marked processed and Stripe never retried, silently stranding the
// business without stripe_customer_id/stripe_sub_id, a cleared payment
// warning, or a paid invoice. Every branch below now throws on a write
// error so the outer catch's 500 response makes Stripe retry instead.
//
// HTML-injection fix (2026-09-25): the welcome and payment-failed emails
// above interpolate the business's own `name` (free text, set by the
// business owner at signup with no character restriction — see
// Onboarding.jsx) directly into an HTML email body. A business name
// containing markup (e.g. an anchor tag) would render as live HTML in
// the recipient's inbox — and for the payment-failed alert, that
// recipient is OPERATOR_EMAIL, i.e. the site operator's own inbox, not
// just the business's own. Fixed by escaping via the new shared
// escapeHtml() (_shared/html.ts) before interpolation; a plain business
// name like "Smith & Sons" still renders correctly once the email client
// decodes the entities.
//
// Dispute/chargeback visibility (added 2026-10-03): this endpoint had zero
// handling for charge.dispute.* — the default case silently ignores any
// event type it doesn't explicitly list, which is indistinguishable from
// "never configured" from the outside. A dispute carries a hard
// evidence-submission deadline and Stripe deducts the amount immediately
// pending resolution, so losing by default (no response) is the worst
// outcome — this needed an actual human-facing alert, not just a missing
// case. Alerts OPERATOR_EMAIL (same mechanism as invoice.payment_failed
// above), not notify-slack — notify-slack posts to the TRADE BUSINESS's
// own Slack webhook, but invoice payments aren't split via Stripe Connect
// (see create-invoice-payment-intent), so a dispute is against Minerva's
// own Stripe account and it's the operator who has to submit evidence, not
// necessarily the business. Also writes an agent_insights row (same
// "detect and alert, never auto-correct" posture as every other financial
// anomaly in this codebase, e.g. reconcile-billing's drift checks) so it's
// visible in-dashboard too, not just in an inbox. Resolves the matching
// business/invoice via the dispute's payment_intent metadata (set by
// create-invoice-payment-intent) on a best-effort basis — if that lookup
// fails, the alert still fires, just without attribution, since "a
// dispute happened" is worth knowing even unattributed.
//
// Refund visibility (added same round): charge.refunded had the identical
// gap — a business/client getting a full refund processed directly in the
// Stripe Dashboard (there's no refund button anywhere in Minerva's own UI)
// was completely invisible, and worse than the dispute gap in one way: the
// invoice would keep showing "PAID" in DispatcherView/InvoiceView forever,
// actively wrong rather than just silent. Only acts on a FULL refund
// (charge.refunded === true) — a partial refund doesn't change whether the
// invoice is "mostly paid," and representing that correctly is a separate
// design question left for later.
//
// invoices.status now gets a real 'refunded' value too (added right after
// the alert-only version shipped, once DispatcherView/InvoiceView/the
// Overview tab's revenue math were all updated to handle it — see each
// file's own comments). Distinct from 'void': a void invoice was never
// actually paid, a refunded one genuinely was and got reversed, which
// matters for both the dispatcher reading the list and for revenue
// reporting. paid_at is left untouched (it genuinely was paid then) —
// refunded_at is layered on top as its own fact.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
  planCheckoutSessionCompleted,
  planSubscriptionDeleted,
  planSubscriptionUpdated,
  stripeEventCreatedToIso,
  planInvoicePaymentFailed,
  planInvoicePaymentSucceeded,
  planPaymentIntentSucceeded,
  planDisputeCreated,
  planDisputeClosed,
  buildDisputeMessage,
  buildDisputeFallbackSummary,
  buildDisputeClosedMessage,
  planChargeRefunded,
  planInvoiceRefunded,
  buildRefundMessage,
  buildRefundFallbackSummary,
  buildProIndustrialMismatchMessage,
  buildProIndustrialMismatchFallbackSummary,
  shouldAlertOperator,
  shouldApplyCheckoutCompletion,
} from "./logic.ts"
import { escapeHtml } from "../_shared/html.ts"
import { isTierAvailableForSector } from "../_shared/tierEligibility.ts"
import { notifySlack } from "../_shared/notifySlack.ts"

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

serve(async (req: Request) => {
  const signature = req.headers.get('stripe-signature')
  const body = await req.text()
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')

  if (!signature || !webhookSecret) {
    return new Response('Missing signature or webhook secret', { status: 400 })
  }

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  try {
    // Atomically claim this event before doing any processing — an INSERT
    // into processed_stripe_events (event_id is the primary key) either
    // succeeds (this request owns the event) or fails on a unique-
    // violation (a concurrent/retried delivery of the same event.id
    // already claimed it). The previous design checked "already
    // processed?" with a plain SELECT and only inserted the claim AFTER
    // the switch below ran — leaving a window where two near-simultaneous
    // deliveries of the same event.id could both pass the check and both
    // run the full branch. Every branch's own DB write is itself
    // idempotent (plain UPDATEs re-writing the same values), but the
    // checkout.session.completed welcome email and invoice.payment_failed
    // operator alert are NOT, and would double-send. (Fixed 2026-09-29.)
    const { error: claimError } = await supabaseAdmin
      .from('processed_stripe_events')
      .insert({ event_id: event.id, event_type: event.type })
    if (claimError) {
      if (claimError.code === '23505') {
        // Unique-violation — another request already claimed this event.
        return new Response(JSON.stringify({ received: true, duplicate: true }), { status: 200 })
      }
      throw new Error(`Failed to claim event ${event.id}: ${claimError.message}`)
    }

    try {
      switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        // Also fetch the subscription item id — sync-technician-billing needs
        // it to update billed quantity later, and it isn't on the session
        // object. This is the one part of this branch that needs its own
        // Stripe API call, so it stays here rather than in the pure planner.
        let subItemId: string | null = null
        if (session.metadata?.business_id && session.customer && session.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription as string)
            subItemId = sub.items.data[0]?.id ?? null
          } catch (err) {
            console.error('Failed to retrieve subscription for item id:', err.message)
          }
        }

        const plan = planCheckoutSessionCompleted(session, subItemId)
        if (plan) {
          const { data: biz } = await supabaseAdmin.from('businesses').select('name, stripe_customer_id').eq('id', plan.businessId).maybeSingle()

          // Cross-tenant hijack guard — see shouldApplyCheckoutCompletion's
          // header comment in logic.ts. create-checkout-session has no
          // caller-identity check (its one real caller is pre-auth), so
          // session.metadata.business_id is only as trustworthy as whoever
          // originally started the checkout claimed it was. Only apply this
          // write if the target business has no *different* Stripe customer
          // already on file — true for every real first-time signup, false
          // for an attempt to attach a stranger's paid checkout onto an
          // existing business.
          if (!shouldApplyCheckoutCompletion(biz?.stripe_customer_id, plan.update.stripe_customer_id)) {
            console.error('stripe-webhook: refusing to overwrite existing stripe_customer_id for business', plan.businessId, '— possible cross-tenant checkout hijack attempt (session customer', plan.update.stripe_customer_id, ')')
            break
          }

          const { error } = await supabaseAdmin
            .from('businesses')
            .update(plan.update)
            .eq('id', plan.businessId)
          if (error) throw new Error(`Failed to save Stripe IDs: ${error.message}`)

          // Best-effort welcome email — send-email no-ops cleanly if
          // RESEND_API_KEY isn't configured, so this never blocks the
          // webhook's real job (saving the Stripe IDs above).
          if (plan.welcomeEmailTo) {
            fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
              body: JSON.stringify({
                to: plan.welcomeEmailTo,
                subject: `You're live on Minerva`,
                html: `<p>Hi${biz?.name ? ' ' + escapeHtml(biz.name) : ''},</p><p>Your Minerva trial has started. Your 7-day free trial runs from today, and your card will be billed automatically when it ends unless you cancel first from your billing settings.</p><p>— The Minerva team</p>`,
              }),
            }).catch(err => console.error('stripe-webhook: welcome email failed', err))
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        // Mark the business as cancelled so the dispatcher app can show a
        // "trial/subscription ended" state instead of silently continuing.
        //
        // Ordering guard (added 2026-10-08): stamps subscription_tier_synced_at
        // with THIS event's own Stripe-generated timestamp and only commits the
        // write if no newer event already landed — see
        // supabase_schema_delta_subscription_tier_sync_guard.sql's header for
        // the exact scenario this closes (a stale, pre-cancellation
        // subscription.updated delivered AFTER this event, which would
        // otherwise silently resurrect a cancelled business's tier). A plain
        // UPDATE with no matching row (because a newer event already won) is
        // not an error — it's the guard working as intended.
        const plan = planSubscriptionDeleted(event.data.object as Stripe.Subscription)
        if (plan) {
          const eventCreatedIso = stripeEventCreatedToIso(event.created)
          const { data: biz, error } = await supabaseAdmin
            .from('businesses')
            .update({ ...plan.update, subscription_tier_synced_at: eventCreatedIso })
            .eq('stripe_sub_id', plan.subscriptionId)
            .or(`subscription_tier_synced_at.is.null,subscription_tier_synced_at.lt.${eventCreatedIso}`)
            .select('id, name, contact_email')
            .maybeSingle()
          if (error) throw new Error(`Failed to mark subscription cancelled: ${error.message}`)

          // Notify (added 2026-10-09) — until now this was a pure database
          // write with no notification to anyone, business or operator:
          // "so the dispatcher app can show a cancelled state" only ever
          // reaches someone who happens to log back in. `biz` is only set
          // when THIS update actually won the ordering guard above (a
          // stale/out-of-order event correctly gets 0 rows and stays
          // silent — nothing to tell anyone about an event that didn't
          // actually apply). Wording branches on `plan.involuntary`: a
          // business that just clicked "cancel" in the Customer Portal
          // already saw Stripe's own confirmation and doesn't need to be
          // told their card was declined, which didn't happen.
          if (biz) {
            if (biz.contact_email) {
              const bizName = biz.name || 'your account'
              const subject = plan.involuntary ? `Your Minerva subscription has been cancelled` : `Minerva subscription cancelled — confirmed`
              const html = plan.involuntary
                ? `<p>Hi,</p><p>Your Minerva subscription for <strong>${escapeHtml(bizName)}</strong> has been cancelled after repeated payment attempts failed. Dispatch and tracking for your business have stopped.</p><p>If this wasn't intentional, you can start a new subscription any time from the app at the same sign-up link you used originally.</p><p>— The Minerva team</p>`
                : `<p>Hi,</p><p>This confirms your Minerva subscription for <strong>${escapeHtml(bizName)}</strong> has been cancelled, as requested. Dispatch and tracking for your business have stopped.</p><p>You're welcome back any time — just sign up again from the app.</p><p>— The Minerva team</p>`
              fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
                body: JSON.stringify({ to: biz.contact_email, subject, html }),
              }).catch(err => console.error('stripe-webhook: cancellation business email failed', err))
            }

            await notifySlack(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, biz.id,
              plan.involuntary
                ? `🚫 Subscription cancelled after repeated failed payments — *${biz.name || 'this business'}* is no longer active.`
                : `🚫 Subscription cancelled (self-serve) — *${biz.name || 'this business'}* is no longer active.`)

            // Operator alert too — a cancelled subscriber is exactly the
            // kind of thing the person running Minerva would want to know
            // about for their own retention/outreach tracking, same
            // reasoning as every other operator alert in this file.
            const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
            if (shouldAlertOperator(operatorEmail)) {
              fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
                body: JSON.stringify({
                  to: operatorEmail,
                  subject: `[Minerva] Subscription cancelled — ${biz.name || plan.subscriptionId}`,
                  html: `<p><strong>${escapeHtml(biz.name || 'A business')}</strong>'s subscription was cancelled${plan.involuntary ? ' after repeated failed payments' : ' (self-serve, via the Customer Portal)'}.</p>`,
                }),
              }).catch(err => console.error('stripe-webhook: cancellation operator alert failed', err))
            }
          }
        }
        break
      }

      case 'customer.subscription.updated': {
        // Keeps subscription_tier in sync with a self-serve plan switch
        // made through the Stripe Customer Portal — see planSubscriptionUpdated's
        // own comment for why this was missing and why it's scoped the way it is.
        //
        // Same ordering guard as customer.subscription.deleted above, and for
        // the same reason: two genuine plan switches in quick succession (or
        // a switch racing a cancellation) can be DELIVERED out of the order
        // they actually happened in. Comparing against subscription_tier_
        // synced_at — not just trusting whichever event arrives — makes
        // whichever change is chronologically newest win regardless of
        // delivery order.
        const priceIdToTier: Record<string, 'starter' | 'standard' | 'pro'> = {}
        const starterPrice = Deno.env.get('STRIPE_PRICE_ID_STARTER')
        const stdPrice = Deno.env.get('STRIPE_PRICE_ID_STD')
        const proPrice = Deno.env.get('STRIPE_PRICE_ID_PRO')
        if (starterPrice) priceIdToTier[starterPrice] = 'starter'
        if (stdPrice) priceIdToTier[stdPrice] = 'standard'
        if (proPrice) priceIdToTier[proPrice] = 'pro'

        const plan = planSubscriptionUpdated(event.data.object as Stripe.Subscription, priceIdToTier)
        if (plan) {
          // Pro/Industrial Customer-Portal mismatch guard (added
          // 2026-10-08) — see buildProIndustrialMismatchMessage's own
          // comment in logic.ts. This is the ONE path the signup-time
          // create-checkout-session guard can't reach: an existing
          // customer self-serving a plan switch through Stripe's own
          // hosted Customer Portal. Checked against a fresh read of the
          // business's sector (not cached/assumed) before applying
          // anything.
          const { data: bizForTierCheck } = await supabaseAdmin
            .from('businesses')
            .select('id, name, sector')
            .eq('stripe_sub_id', plan.subscriptionId)
            .maybeSingle()

          if (!isTierAvailableForSector(plan.update.subscription_tier, bizForTierCheck?.sector)) {
            console.error('stripe-webhook: Pro/Industrial mismatch via Customer Portal — not syncing subscription_tier, alerting operator. business:', bizForTierCheck?.id, 'subscription:', plan.subscriptionId)

            const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
            if (shouldAlertOperator(operatorEmail)) {
              fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
                body: JSON.stringify({
                  to: operatorEmail,
                  subject: `[Minerva] Pro/Industrial billing mismatch — ${bizForTierCheck?.name || plan.subscriptionId}`,
                  html: `<p>${escapeHtml(buildProIndustrialMismatchMessage(bizForTierCheck?.name || null, plan.subscriptionId))}</p>`,
                }),
              }).catch(err => console.error('stripe-webhook: Pro/Industrial mismatch operator alert failed', err))
            }

            await supabaseAdmin.from('agent_insights').insert({
              agent: 'finance',
              insight_type: 'anomaly',
              summary: buildProIndustrialMismatchFallbackSummary(bizForTierCheck?.name || null, plan.subscriptionId),
              business_id: bizForTierCheck?.id || null,
              related_table: 'businesses',
              related_id: bizForTierCheck?.id || null,
            }).then(() => {}, (insErr) => console.error('stripe-webhook: Pro/Industrial mismatch insight insert failed', insErr))

            break
          }

          const eventCreatedIso = stripeEventCreatedToIso(event.created)
          const { error } = await supabaseAdmin
            .from('businesses')
            .update({ ...plan.update, subscription_tier_synced_at: eventCreatedIso })
            .eq('stripe_sub_id', plan.subscriptionId)
            .or(`subscription_tier_synced_at.is.null,subscription_tier_synced_at.lt.${eventCreatedIso}`)
          if (error) throw new Error(`Failed to sync subscription_tier: ${error.message}`)
        }
        break
      }

      case 'invoice.payment_failed': {
        // A charge was declined. The subscription isn't cancelled yet —
        // Stripe enters its own dunning/retry cycle first, which can run for
        // days to weeks depending on account settings — but nothing else in
        // Minerva has any way to know that's happening until (if) Stripe
        // eventually gives up and fires customer.subscription.deleted above.
        // Record it now so the dispatcher app can warn the owner immediately
        // instead of leaving them unaware their card was declined.
        const plan = planInvoicePaymentFailed(event.data.object as Stripe.Invoice, new Date().toISOString())
        if (plan) {
          const { data: biz, error } = await supabaseAdmin
            .from('businesses')
            .update(plan.update)
            .eq('stripe_sub_id', plan.subscriptionId)
            .select('id, name, contact_email')
            .maybeSingle()
          if (error) throw new Error(`Failed to record payment_failed_at: ${error.message}`)

          // Best-effort operator alert — see test-agent-health's header
          // comment for why this exists: without it, a declined card sits
          // silently in Stripe's own dunning cycle for days with nothing in
          // Minerva surfacing it to the person who'd actually want to know.
          // No-ops cleanly if OPERATOR_EMAIL isn't set (see send-email).
          const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
          if (shouldAlertOperator(operatorEmail)) {
            fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
              body: JSON.stringify({
                to: operatorEmail,
                subject: `[Minerva] Payment failed — ${biz?.name || plan.subscriptionId}`,
                html: `<p>A Stripe charge for <strong>${escapeHtml(biz?.name || 'a business')}</strong> (subscription ${plan.subscriptionId}) failed. Stripe will retry automatically per its dunning schedule — no action needed unless it keeps failing. Check the dispatcher app's billing warning or the Stripe dashboard for details.</p>`,
              }),
            }).catch(err => console.error('stripe-webhook: operator payment-failed alert failed', err))
          }

          // Business-facing alert (added 2026-10-09) — until now, the ONLY
          // place a declined card ever surfaced to the business itself was
          // an in-app banner (DispatcherView/IndustrialDispatcherView,
          // reading payment_failed_at), visible only if someone happens to
          // log in while it's set. Stripe's own dunning cycle can run for
          // days to weeks before giving up and firing
          // customer.subscription.deleted — a business could lose their
          // whole account with no proactive warning at all beyond that
          // banner. Mirrors the welcome/trial-ending emails' own channel
          // and tone. No throttle on repeat retries, same as the operator
          // alert above — each Stripe retry is genuinely new information
          // ("we tried again, still declined"), not a duplicate.
          if (biz?.contact_email) {
            fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
              body: JSON.stringify({
                to: biz.contact_email,
                subject: `Action needed: your Minerva payment didn't go through`,
                html: `<p>Hi,</p><p>Your most recent payment for <strong>${escapeHtml(biz.name || 'your account')}</strong> didn't go through — your bank or card issuer declined the charge. Stripe will automatically retry over the next few days, but if it keeps failing your account will eventually be cancelled.</p><p>Update your card from Settings → Billing in the app as soon as you can to avoid any interruption.</p><p>— The Minerva team</p>`,
              }),
            }).catch(err => console.error('stripe-webhook: business payment-failed email failed', err))
          }

          // Slack too, same channel as every other business-facing
          // time-sensitive billing alert in this codebase (weather risk,
          // retention, trial-ending, cancellation below) — added alongside
          // the cancellation notice for consistency, rather than leaving
          // this one email-only while its neighbors use both channels.
          if (biz?.id) {
            await notifySlack(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, biz.id,
              `💳 Payment failed for *${biz.name || 'this business'}* — Stripe will retry automatically. We've emailed the account owner. If it keeps failing, the subscription will eventually be cancelled.`)
          }
        }
        break
      }

      case 'invoice.payment_succeeded': {
        // Clears the warning set above — either a retried charge went
        // through and the subscription is healthy again, or this is the
        // very first invoice on a fresh subscription (payment_failed_at is
        // already null then, so this is a harmless no-op in that case).
        const plan = planInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
        if (plan) {
          const { error } = await supabaseAdmin
            .from('businesses')
            .update(plan.update)
            .eq('stripe_sub_id', plan.subscriptionId)
          if (error) throw new Error(`Failed to clear payment_failed_at: ${error.message}`)
        }
        break
      }

      case 'payment_intent.succeeded': {
        // A client paid a one-off invoice via the "Pay now" flow
        // (create-invoice-payment-intent). Mark the matching invoice paid —
        // this is the automated counterpart to DispatcherView's existing
        // manual "Mark Paid" button, which remains untouched and is still
        // how every invoice gets marked paid unless a business turns this
        // optional flow on.
        const plan = planPaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent, new Date().toISOString())
        if (plan) {
          const { error } = await supabaseAdmin
            .from('invoices')
            .update(plan.update)
            .eq('id', plan.invoiceId)
            .eq('stripe_payment_intent_id', plan.paymentIntentId)
          if (error) throw new Error(`Failed to mark invoice paid from payment_intent.succeeded: ${error.message}`)
        }
        break
      }

      case 'charge.dispute.created': {
        const dispute = event.data.object as Stripe.Dispute
        // Normalize to plain primitives before handing to the pure planner
        // — payment_intent is typed as string | Stripe.PaymentIntent | null
        // in the SDK (only ever a bare string on an unexpanded webhook
        // payload, which this is, but not worth relying on that silently).
        const plan = planDisputeCreated({
          id: dispute.id,
          amount: dispute.amount,
          currency: dispute.currency,
          reason: dispute.reason,
          payment_intent: typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null,
        })
        if (plan) {
          // Email, not Slack: notify-slack posts to the TRADE BUSINESS's own
          // Slack (looked up by businessId) — but the dispute is against
          // Minerva's own Stripe account (invoice payments aren't split via
          // Connect, see create-invoice-payment-intent), so it's the
          // operator who actually needs to submit evidence, not necessarily
          // the business. Reuses the exact same OPERATOR_EMAIL mechanism
          // invoice.payment_failed already established for this reason.
          const { businessId, businessName, invoiceId } = await resolvePaymentIntentAttribution(plan.paymentIntentId)

          const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
          if (shouldAlertOperator(operatorEmail)) {
            fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
              body: JSON.stringify({
                to: operatorEmail,
                subject: `[Minerva] Dispute opened — ${businessName || plan.disputeId}`,
                html: `<p>${escapeHtml(buildDisputeMessage(businessName, plan.amountCents, plan.currency, plan.reason, invoiceId))}</p>`,
              }),
            }).catch(err => console.error('stripe-webhook: dispute operator alert failed', err))
          }

          await supabaseAdmin.from('agent_insights').insert({
            agent: 'finance',
            insight_type: 'anomaly',
            summary: buildDisputeFallbackSummary(businessName, plan.amountCents, plan.currency, plan.reason),
            business_id: businessId,
            related_table: invoiceId ? 'invoices' : null,
            related_id: invoiceId,
          }).then(() => {}, (err) => console.error('stripe-webhook: dispute insight insert failed', err))
        }
        break
      }

      case 'charge.dispute.closed': {
        const dispute = event.data.object as Stripe.Dispute
        const disputePaymentIntentId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : null
        const plan = planDisputeClosed({
          id: dispute.id,
          status: dispute.status,
          amount: dispute.amount,
          currency: dispute.currency,
          payment_intent: disputePaymentIntentId,
        })
        if (plan) {
          const { businessName } = await resolvePaymentIntentAttribution(disputePaymentIntentId)

          const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
          if (shouldAlertOperator(operatorEmail)) {
            fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
              body: JSON.stringify({
                to: operatorEmail,
                subject: `[Minerva] Dispute resolved — ${businessName || plan.disputeId}`,
                html: `<p>${escapeHtml(buildDisputeClosedMessage(businessName, plan.status, plan.amountCents, plan.currency))}</p>`,
              }),
            }).catch(err => console.error('stripe-webhook: dispute-closed operator alert failed', err))
          }
        }
        break
      }

      case 'charge.refunded': {
        const charge = event.data.object as Stripe.Charge
        const chargePaymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null
        const plan = planChargeRefunded({
          id: charge.id,
          refunded: charge.refunded,
          amount_refunded: charge.amount_refunded,
          currency: charge.currency,
          payment_intent: chargePaymentIntentId,
        })
        if (plan) {
          const { businessId, businessName, invoiceId } = await resolvePaymentIntentAttribution(plan.paymentIntentId)

          // Mark the invoice refunded BEFORE alerting — if this write
          // fails, throw (same as every other write in this file) so the
          // outer catch makes Stripe retry the whole event, rather than
          // sending an alert that claims "marked refunded automatically"
          // when it wasn't. The extra .eq('status', 'paid') guard means a
          // refund landing on an invoice some other path already touched
          // (e.g. a dispatcher manually voiding it around the same time)
          // doesn't clobber that — Stripe is still the source of truth for
          // the alert either way, just not for this particular write.
          if (invoiceId) {
            const invoicePlan = planInvoiceRefunded(new Date().toISOString())
            const { error: refundUpdateErr } = await supabaseAdmin
              .from('invoices')
              .update(invoicePlan.update)
              .eq('id', invoiceId)
              .eq('stripe_payment_intent_id', plan.paymentIntentId)
              .eq('status', 'paid')
            if (refundUpdateErr) throw new Error(`Failed to mark invoice refunded: ${refundUpdateErr.message}`)
          }

          const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
          if (shouldAlertOperator(operatorEmail)) {
            fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
              body: JSON.stringify({
                to: operatorEmail,
                subject: `[Minerva] Payment refunded — ${businessName || plan.chargeId}`,
                html: `<p>${escapeHtml(buildRefundMessage(businessName, plan.amountRefundedCents, plan.currency, invoiceId))}</p>`,
              }),
            }).catch(err => console.error('stripe-webhook: refund operator alert failed', err))
          }

          await supabaseAdmin.from('agent_insights').insert({
            agent: 'finance',
            insight_type: 'anomaly',
            summary: buildRefundFallbackSummary(businessName, plan.amountRefundedCents, plan.currency),
            business_id: businessId,
            related_table: invoiceId ? 'invoices' : null,
            related_id: invoiceId,
          }).then(() => {}, (err) => console.error('stripe-webhook: refund insight insert failed', err))
        }
        break
      }

      default:
        // Ignore other event types.
        break
    }
    } catch (branchErr) {
      // The branch failed after the claim above already succeeded —
      // release it so a legitimate Stripe retry (after a real transient
      // failure) can actually re-run the branch, instead of being
      // silently swallowed as "already processed" forever.
      await supabaseAdmin.from('processed_stripe_events').delete().eq('event_id', event.id).then(() => {}, () => {})
      throw branchErr
    }

    supabaseAdmin.rpc('record_agent_run', { fn_name: 'stripe-webhook', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error('stripe-webhook handler error:', err)
    try {
      supabaseAdmin.rpc('record_agent_run', { fn_name: 'stripe-webhook', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})

// Best-effort: resolves a PaymentIntent id back to the Minerva invoice/
// business it paid, via the metadata create-invoice-payment-intent set on
// the PaymentIntent at creation. Shared by both the dispute and refund
// alerting below — same lookup, same "fire the alert unattributed rather
// than not at all" fallback either way. Never throws — returns all-null
// fields if the payment_intent is missing or either lookup fails.
async function resolvePaymentIntentAttribution(paymentIntentId: string | null): Promise<{ businessId: string | null; businessName: string | null; invoiceId: string | null }> {
  if (!paymentIntentId) return { businessId: null, businessName: null, invoiceId: null }
  try {
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
    const businessId = (pi.metadata?.business_id as string | undefined) || null
    const invoiceId = (pi.metadata?.invoice_id as string | undefined) || null
    let businessName: string | null = null
    if (businessId) {
      const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', businessId).maybeSingle()
      businessName = biz?.name || null
    }
    return { businessId, businessName, invoiceId }
  } catch (err) {
    console.error('stripe-webhook: payment_intent attribution lookup failed', err)
    return { businessId: null, businessName: null, invoiceId: null }
  }
}
