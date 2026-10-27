// Supabase Edge Function: new-subscriber-checkin
// Cron sweep (no body, daily) — a genuine two-week "how's it going?" email
// to a business that actually converted to paying, not a cold prospect.
//
// WHY: retention-checkin already does this for a trade business's
// relationship with ITS OWN clients. Nothing does the equivalent for
// Minerva's relationship with its own paying business customers — the
// first couple of weeks after converting are exactly when a business
// either quietly starts relying on Minerva or quietly starts resenting a
// rough edge nobody told us about. It's also the only realistic source
// for CaseStudy.jsx, which is an explicit template waiting on "a real
// founding customer's real numbers" (see that file's own header comment)
// — this is the first actual touchpoint that could ever lead there.
//
// Deliberately does NOT ask for a testimonial, a star rating, or anything
// requiring a reply beyond plain feedback — same "don't automate the
// judgment call" boundary as flag-abandoned-signups not auto-deleting and
// CaseStudy.jsx staying unlinked until a human actually fills it in with
// something true. This just opens the door; deciding whether a reply is
// good enough to ask permission to quote is a human call, made via the
// operator alert below, never by this function.
//
// Fires once per business, 21-28 days after signup (created_at, same
// anchor isTrialExpired/businessAccess.js already uses — not the exact
// moment they converted, since that would need a new timestamp column,
// and most businesses convert within the 14-day trial anyway, so this
// lands within the first ~1-2 weeks of being a real customer either way).
// Only businesses that actually have stripe_sub_id set (genuinely
// converted, not just signed up) and aren't cancelled. Claimed via
// businesses.founding_checkin_sent_at (see
// supabase_schema_delta_new_subscriber_checkin.sql) using the same atomic
// claim-before-act pattern as every other agent with side effects here.
//
// Also alerts the operator (OPERATOR_EMAIL, same secret/pattern as
// stripe-webhook's payment_failed alert — still unset as of writing, so
// this is a harmless no-op until it's configured, same as that one) so a
// personal follow-up on a reply is a real possibility, not just an email
// going unread into the void.
//
// Deploy with: supabase functions deploy new-subscriber-checkin

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { escapeHtml } from "../_shared/html.ts"

// Shifted +7 days (2026-10-27) when the signup trial moved from 7 to 14
// days — this window is deliberately anchored to "1-2 weeks after
// becoming a real paying customer" (see comment below), not to signup
// age in the abstract, so it has to move with the trial length or it'd
// start firing as early as the day the trial itself ends.
const MIN_AGE_MS = 21 * 24 * 60 * 60 * 1000
const MAX_AGE_MS = 28 * 24 * 60 * 60 * 1000

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'new-subscriber-checkin').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const nowMs = Date.now()
    const windowStart = new Date(nowMs - MAX_AGE_MS).toISOString()
    const windowEnd = new Date(nowMs - MIN_AGE_MS).toISOString()

    const { data: due, error: dueErr } = await supabase
      .from('businesses')
      .select('id, name, contact_email, created_at')
      .not('stripe_sub_id', 'is', null)
      .neq('subscription_tier', 'cancelled')
      .is('founding_checkin_sent_at', null)
      .not('contact_email', 'is', null)
      .gte('created_at', windowStart)
      .lte('created_at', windowEnd)

    if (dueErr) throw dueErr

    const operatorEmail = Deno.env.get('OPERATOR_EMAIL')

    let checkedIn = 0
    for (const biz of due || []) {
      const nowIso = new Date().toISOString()
      const { data: claimed, error: claimErr } = await supabase
        .from('businesses')
        .update({ founding_checkin_sent_at: nowIso })
        .eq('id', biz.id)
        .is('founding_checkin_sent_at', null)
        .select('id')
      if (claimErr) { console.error('new-subscriber-checkin: claim failed:', claimErr.message); continue }
      if (!claimed || claimed.length === 0) continue // already claimed by a concurrent run

      const bizName = biz.name || 'there'

      try {
        const emailRes = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            to: biz.contact_email,
            subject: `How's Minerva going so far?`,
            html: `<p>Hi,</p><p>You've been using Minerva for about two weeks now. We'd genuinely like to know how it's going — what's working, what isn't, or anything you wish it did differently.</p><p>Just reply to this email. A real person reads every reply.</p><p>— The Minerva team</p>`,
          }),
        })
        if (!emailRes.ok) console.error(`new-subscriber-checkin: send-email returned ${emailRes.status} for business ${biz.id}`)
      } catch (emailErr) {
        console.error('new-subscriber-checkin: send-email failed:', emailErr)
      }

      if (operatorEmail) {
        fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
          body: JSON.stringify({
            to: operatorEmail,
            subject: `[Minerva] 2-week check-in sent — ${bizName}`,
            html: `<p>A 2-week check-in email just went out to <strong>${escapeHtml(bizName)}</strong> (${escapeHtml(biz.contact_email)}). Worth a personal follow-up if you have a moment — especially if they reply with anything specific.</p>`,
          }),
        }).catch(err => console.error('new-subscriber-checkin: operator alert failed', err))
      }

      checkedIn++
    }

    supabase.rpc('record_agent_run', { fn_name: 'new-subscriber-checkin', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: (due || []).length, checkedIn }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('new-subscriber-checkin error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'new-subscriber-checkin', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
