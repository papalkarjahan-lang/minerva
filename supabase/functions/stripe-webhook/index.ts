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
//                    invoice.payment_failed, invoice.payment_succeeded
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
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const businessId = session.metadata?.business_id
        if (businessId && session.customer && session.subscription) {
          // Also fetch the subscription item id — sync-technician-billing needs
          // it to update billed quantity later, and it isn't on the session object.
          let subItemId: string | null = null
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription as string)
            subItemId = sub.items.data[0]?.id ?? null
          } catch (err) {
            console.error('Failed to retrieve subscription for item id:', err.message)
          }

          const { error } = await supabaseAdmin
            .from('businesses')
            .update({
              stripe_customer_id: session.customer as string,
              stripe_sub_id: session.subscription as string,
              stripe_sub_item_id: subItemId,
            })
            .eq('id', businessId)
          if (error) console.error('Failed to save Stripe IDs:', error.message)

          // Best-effort welcome email — send-email no-ops cleanly if
          // RESEND_API_KEY isn't configured, so this never blocks the
          // webhook's real job (saving the Stripe IDs above).
          const contactEmail = session.customer_details?.email
          if (contactEmail) {
            const { data: biz } = await supabaseAdmin.from('businesses').select('name').eq('id', businessId).maybeSingle()
            fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
              body: JSON.stringify({
                to: contactEmail,
                subject: `You're live on Minerva`,
                html: `<p>Hi${biz?.name ? ' ' + biz.name : ''},</p><p>Your Minerva trial has started. Your 7-day free trial runs from today, and your card will be billed automatically when it ends unless you cancel first from your billing settings.</p><p>— The Minerva team</p>`,
              }),
            }).catch(err => console.error('stripe-webhook: welcome email failed', err))
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        // Mark the business as cancelled so the dispatcher app can show a
        // "trial/subscription ended" state instead of silently continuing.
        const { error } = await supabaseAdmin
          .from('businesses')
          .update({ subscription_tier: 'cancelled' })
          .eq('stripe_sub_id', subscription.id)
        if (error) console.error('Failed to mark subscription cancelled:', error.message)
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
        const invoice = event.data.object as Stripe.Invoice
        const subId = invoice.subscription as string | null
        if (subId) {
          const { data: biz, error } = await supabaseAdmin
            .from('businesses')
            .update({ payment_failed_at: new Date().toISOString() })
            .eq('stripe_sub_id', subId)
            .select('id, name')
            .maybeSingle()
          if (error) console.error('Failed to record payment_failed_at:', error.message)

          // Best-effort operator alert — see test-agent-health's header
          // comment for why this exists: without it, a declined card sits
          // silently in Stripe's own dunning cycle for days with nothing in
          // Minerva surfacing it to the person who'd actually want to know.
          // No-ops cleanly if OPERATOR_EMAIL isn't set (see send-email).
          const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
          if (operatorEmail) {
            fetch(`${Deno.env.get('SUPABASE_URL')!}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}` },
              body: JSON.stringify({
                to: operatorEmail,
                subject: `[Minerva] Payment failed — ${biz?.name || subId}`,
                html: `<p>A Stripe charge for <strong>${biz?.name || 'a business'}</strong> (subscription ${subId}) failed. Stripe will retry automatically per its dunning schedule — no action needed unless it keeps failing. Check the dispatcher app's billing warning or the Stripe dashboard for details.</p>`,
              }),
            }).catch(err => console.error('stripe-webhook: operator payment-failed alert failed', err))
          }
        }
        break
      }

      case 'invoice.payment_succeeded': {
        // Clears the warning set above — either a retried charge went
        // through and the subscription is healthy again, or this is the
        // very first invoice on a fresh subscription (payment_failed_at is
        // already null then, so this is a harmless no-op in that case).
        const invoice = event.data.object as Stripe.Invoice
        const subId = invoice.subscription as string | null
        if (subId) {
          const { error } = await supabaseAdmin
            .from('businesses')
            .update({ payment_failed_at: null })
            .eq('stripe_sub_id', subId)
          if (error) console.error('Failed to clear payment_failed_at:', error.message)
        }
        break
      }

      default:
        // Ignore other event types.
        break
    }

    return new Response(JSON.stringify({ received: true }), { status: 200 })
  } catch (err) {
    console.error('stripe-webhook handler error:', err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500 })
  }
})
