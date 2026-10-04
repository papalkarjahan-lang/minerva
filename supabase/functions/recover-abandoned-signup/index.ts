// Supabase Edge Function: recover-abandoned-signup
// Cron sweep (no body, daily) — the missing step before flag-abandoned-
// signups gives up on a stalled signup.
//
// WHY: Onboarding.jsx creates the businesses row (and technicians rows, and
// sends each technician a real setup SMS) BEFORE the Stripe checkout
// redirect even happens (see businessAccess.js's isTrialExpired comment).
// If the owner closes the tab, their card is declined, or anything else
// interrupts that redirect, the business is left with stripe_sub_id null
// and no activated account — and until now, the ONLY thing that ever
// happened next was flag-abandoned-signups writing an internal
// agent_insights row 48 hours later so a human can review it for deletion.
// Nothing ever told the actual business they'd started signing up and
// never finished — the single highest-leverage recovery available for
// "get the subscriptions" (an interested prospect who already gave their
// email and trade details, not a cold lead) was simply never attempted.
//
// Fires once per business, 3-36 hours after signup (old enough that this
// isn't just someone still mid-form, young enough to land well before
// flag-abandoned-signups' 48h give-up point and before this function's
// first deploy reaches into old pre-existing test/dev rows). Claimed via
// businesses.signup_recovery_sent_at (see
// supabase_schema_delta_signup_recovery.sql) using the same atomic
// claim-before-act UPDATE ... WHERE column IS NULL pattern as every other
// agent with side effects in this codebase — a concurrent/overlapping run
// claims 0 rows on anything already sent.
//
// Only queries businesses with a non-null contact_email (required at
// Onboarding step 1 for every signup going forward; a handful of older/
// admin-created rows may lack one) so there's never a "claimed but
// couldn't actually send anything" state — a business with no email here
// is simply left for flag-abandoned-signups' human-review path instead.
//
// Deploy with: supabase functions deploy recover-abandoned-signup

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { escapeHtml } from "../_shared/html.ts"
import { notifySlack } from "../_shared/notifySlack.ts"

const MIN_AGE_MS = 3 * 60 * 60 * 1000
const MAX_AGE_MS = 36 * 60 * 60 * 1000

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'recover-abandoned-signup').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const nowMs = Date.now()
    const windowStart = new Date(nowMs - MAX_AGE_MS).toISOString()
    const windowEnd = new Date(nowMs - MIN_AGE_MS).toISOString()

    const { data: stale, error: staleErr } = await supabase
      .from('businesses')
      .select('id, name, contact_email, created_at')
      .is('stripe_sub_id', null)
      .is('abandoned_flagged_at', null)
      .is('signup_recovery_sent_at', null)
      .not('contact_email', 'is', null)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)

    if (staleErr) throw staleErr

    let recovered = 0
    for (const biz of stale || []) {
      // Atomically claim before sending anything — same TOCTOU-safe
      // pattern as flag-abandoned-signups/notify-addon-trial-ending. A
      // concurrent/overlapping run's claim on the same business affects 0
      // rows and is skipped below.
      const nowIso = new Date().toISOString()
      const { data: claimed, error: claimErr } = await supabase
        .from('businesses')
        .update({ signup_recovery_sent_at: nowIso })
        .eq('id', biz.id)
        .is('signup_recovery_sent_at', null)
        .select('id')
      if (claimErr) { console.error('recover-abandoned-signup: claim failed:', claimErr.message); continue }
      if (!claimed || claimed.length === 0) continue // already claimed by a concurrent run

      const { count: techCount } = await supabase
        .from('technicians')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', biz.id)

      const bizName = biz.name || 'your business'
      const safeName = escapeHtml(bizName)
      const techLine = techCount && techCount > 0
        ? ` ${techCount} technician${techCount === 1 ? '' : 's'} already received a text with their tracking link.`
        : ''

      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            to: biz.contact_email,
            subject: `Finish setting up Minerva for ${bizName}`,
            html: `<p>Hi,</p><p>You started setting up Minerva for <strong>${safeName}</strong> but checkout was never finished, so the account is created but not active yet.${techLine}</p><p>Nothing has been charged — just reply to this email or get in touch and we'll help you finish in a couple of minutes.</p><p>— The Minerva team</p>`,
          }),
        })
        if (!emailRes.ok) console.error(`recover-abandoned-signup: send-email returned ${emailRes.status} for business ${biz.id}`)
      } catch (emailErr) {
        console.error('recover-abandoned-signup: send-email failed:', emailErr)
      }

      // Best-effort bonus channel — near-certainly a no-op this early (a
      // brand-new signup hasn't had a chance to paste in a Slack webhook
      // yet), but free to attempt and consistent with every other
      // outreach-style agent in this codebase trying both channels.
      await notifySlack(supabaseUrl, supabaseServiceKey, biz.id,
        `⏳ You started setting up Minerva for *${bizName}* but haven't finished checkout yet. Nothing's been charged — reply to the email we just sent, or reach out, and we'll help you finish.`)

      recovered++
    }

    supabase.rpc('record_agent_run', { fn_name: 'recover-abandoned-signup', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: (stale || []).length, recovered }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('recover-abandoned-signup error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'recover-abandoned-signup', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
