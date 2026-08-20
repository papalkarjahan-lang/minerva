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
//   Events to send: checkout.session.completed, customer.subscription.deleted
// Copy the signing secret into Supabase secrets as STRIPE_WEBHOOK_SECRET.
//
// Required Supabase secrets:
//   STRIPE_SECRET_KEY       (same key used by create-checkout-session)
//   STRIPE_WEBHOOK_SECRET   (whsec_... from the Stripe webhook settings page)
//   SUPABASE_URL            (auto-provided in Edge Function runtime)
//   SUPABASE_SERVICE_ROLE_KEY (set manually — needed to bypass RLS and write
//                              stripe_customer_id/stripe_sub_id; the anon key
//                              cannot write these columns since no anon
//                              UPDATE policy exists on businesses by design)

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
