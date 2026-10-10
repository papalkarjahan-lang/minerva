// Supabase Edge Function: notify-trial-ending
// Autonomous agent, run daily via pg_cron (see matching *_cron.sql delta).
//
// WHY: Minerva Max add-on trials already get a reminder 3 days before
// they lapse (notify-addon-trial-ending). The main account's 7-day Stripe
// trial — the one every signup starts on, set by create-checkout-session's
// `trial_period_days: '7'` — never did, even though it ends in a real
// card charge rather than a feature quietly turning off. The one thing
// softening this gap: stripe-webhook's checkout.session.completed handler
// already sends a welcome email stating the terms upfront ("your card
// will be billed automatically when it ends unless you cancel first").
// This adds the second, closer-to-the-date reminder every other
// time-sensitive event in Minerva gets, for the same reason weather
// risk/retention/invoice-reminder agents exist: a business that set
// something up a week ago and hasn't thought about it since shouldn't be
// surprised by what happens next.
//
// Unlike notify-addon-trial-ending, there's no local column to read a
// trial's end date from — businesses.max_addon_trials stores ends_at
// itself (computed client-side at trial start), but the main account
// trial is set entirely on the Stripe subscription object, with nothing
// mirrored locally. So this calls stripe.subscriptions.retrieve() per
// candidate business, same cost shape as reconcile-billing's own
// per-business Stripe calls — batched the same way for the same reason.
//
// Scans businesses with a Stripe subscription that haven't been reminded
// yet (trial_ending_reminder_sent_at IS NULL — see
// supabase_schema_delta_trial_ending_reminder.sql), checks each one's
// live Stripe status, and for any genuinely still `trialing` with
// trial_end within the reminder window, atomically claims it (same
// claim-before-act pattern as every other agent with side effects in
// this codebase) before sending an email (mirrors the welcome email's
// own channel/tone) plus a best-effort Slack alert (mirrors
// notify-addon-trial-ending's channel). Never touches anyone who already
// converted, cancelled, or was never on a trial to begin with — Stripe's
// own live `status` is the source of truth each run, not an assumption
// from local data.
//
// Deploy with: supabase functions deploy notify-trial-ending
//
// Required secrets: STRIPE_SECRET_KEY (already set), RESEND_API_KEY
// (already set — send-email no-ops cleanly without it, same as the
// welcome email).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@14?target=deno"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { escapeHtml } from "../_shared/html.ts"
import { notifySlack } from "../_shared/notifySlack.ts"
import { chunk } from "../_shared/batch.ts"
import { evaluateTrialEndingReminder, formatWhenText } from "./logic.ts"

const TRIAL_REMINDER_WINDOW_DAYS = 3
const BUSINESS_BATCH_SIZE = 20

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
})

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'notify-trial-ending').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: candidates, error } = await supabase
      .from('businesses')
      .select('id, name, contact_email, stripe_sub_id')
      .not('stripe_sub_id', 'is', null)
      .neq('subscription_tier', 'cancelled')
      .is('trial_ending_reminder_sent_at', null)
      .not('contact_email', 'is', null)

    if (error) throw error

    let alerted = 0
    // Bounded-concurrency batching — each candidate costs a real Stripe
    // API call (status/trial_end aren't available locally, see header),
    // same reasoning as reconcile-billing's own per-business Stripe
    // lookups. Same chunk()-of-20 shape as the rest of this codebase.
    for (const batch of chunk(candidates || [], BUSINESS_BATCH_SIZE)) {
      const results = await Promise.all(batch.map(biz =>
        notifyOneBusinessTrialEnding(supabase, supabaseUrl, supabaseServiceKey, biz)
      ))
      for (const wasAlerted of results) if (wasAlerted) alerted++
    }

    supabase.rpc('record_agent_run', { fn_name: 'notify-trial-ending', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: (candidates || []).length, alerted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('notify-trial-ending error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      createClient(supabaseUrl, supabaseServiceKey)
        .rpc('record_agent_run', { fn_name: 'notify-trial-ending', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Returns whether a reminder was sent for this business.
async function notifyOneBusinessTrialEnding(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string,
  biz: { id: string; name: string | null; contact_email: string | null; stripe_sub_id: string }
): Promise<boolean> {
  let sub: Stripe.Subscription
  try {
    sub = await stripe.subscriptions.retrieve(biz.stripe_sub_id)
  } catch (err) {
    console.error(`notify-trial-ending: Stripe lookup failed for ${biz.id}`, err)
    return false
  }

  const { shouldSend, shouldClaim, daysLeft } = evaluateTrialEndingReminder(sub.status, sub.trial_end, Date.now(), TRIAL_REMINDER_WINDOW_DAYS)
  // Still trialing but not in the window yet — leave unclaimed so it's
  // picked up again on a future run, once it's actually due. Nothing to
  // do yet.
  if (!shouldClaim) return false

  // Atomically claim before sending anything — same claim-before-act
  // pattern as every other agent with side effects in this codebase. Also
  // closes out a business Stripe reports as no longer trialing at all
  // (shouldSend false but shouldClaim true — see evaluateTrialEndingReminder's
  // own header), so it stops being re-checked via Stripe on every future
  // run. A concurrent/overlapping run's claim affects 0 rows and is
  // skipped.
  const { data: claimed, error: claimErr } = await supabase
    .from('businesses')
    .update({ trial_ending_reminder_sent_at: new Date().toISOString() })
    .eq('id', biz.id)
    .is('trial_ending_reminder_sent_at', null)
    .select('id')
  if (claimErr) { console.error('notify-trial-ending: claim failed:', claimErr.message); return false }
  if (!claimed || claimed.length === 0) return false // already claimed by a concurrent run

  if (!shouldSend) return false // claimed to stop future checks, but already converted/cancelled — nothing to notify about

  const whenText = formatWhenText(daysLeft)
  const bizName = biz.name || 'your business'
  const safeName = escapeHtml(bizName)

  try {
    const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        to: biz.contact_email,
        subject: `Your Minerva trial ${whenText}`,
        html: `<p>Hi,</p><p>Your free trial for <strong>${safeName}</strong> ${whenText}, and your card will then be billed automatically for your plan — same as we mentioned when you signed up.</p><p>Nothing to do if you want to keep going. If you'd rather not continue, cancel any time before then from your billing settings in the app, and you won't be charged.</p><p>— The Minerva team</p>`,
      }),
    })
    if (!emailRes.ok) console.error(`notify-trial-ending: send-email returned ${emailRes.status} for business ${biz.id}`)
  } catch (emailErr) {
    console.error('notify-trial-ending: send-email failed:', emailErr)
  }

  // Best-effort bonus channel — mirrors notify-addon-trial-ending's own
  // reasoning: a business this early may not have a Slack webhook
  // configured yet, but it's free to attempt and consistent with every
  // other time-sensitive agent in this codebase trying both channels.
  await notifySlack(supabaseUrl, supabaseServiceKey, biz.id,
    `⏳ Your Minerva trial for *${bizName}* ${whenText} — we've emailed the account owner. Card will be billed automatically unless cancelled first from billing settings.`)

  return true
}
