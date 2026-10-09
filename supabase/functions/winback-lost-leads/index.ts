// Supabase Edge Function: winback-lost-leads
// Autonomous agent, run daily via pg_cron — the Finance/Front-Desk "lost
// leads" duty. Mirrors nurture-stale-leads' pattern but for leads a
// dispatcher explicitly marked 'lost' (as opposed to leads that just went
// quiet — that's daily-digest's escalation flag). Sends exactly ONE
// re-engagement SMS, 14 days after being marked lost, then never touches
// that lead again regardless of outcome. This is a low-pressure "still
// interested?" nudge, not a sales sequence — same one-touch-only spirit as
// the rest of Minerva's autonomous SMS (see SECURITY_NOTES.md).
// Deploy with: supabase functions deploy winback-lost-leads
//
// Required secrets: same Twilio secrets as the other SMS functions. Optional:
// ANTHROPIC_API_KEY — if set, the win-back SMS is drafted by Claude using
// the lead's original job_description/urgency instead of the fixed
// template. Falls back to the EXACT existing template if the key is
// missing, the call fails, or the draft looks unusable — no behaviour
// change when no key is configured.
//
// Double-send fix (2026-09-24, Round 44 continued further still): same
// bug class and fix as chase-unpaid-invoices/retention-checkin/
// nurture-stale-leads — this used to mark lost_winback_sent_at only AFTER
// sending, leaving a time-of-check/time-of-use race where an overlapping/
// duplicate daily run could see the same not-yet-winback'd lead and text
// it twice, breaking the "exactly ONE re-engagement SMS" guarantee this
// function promises. Now atomically claims each lead with a conditional
// UPDATE (same WHERE as the original SELECT) BEFORE doing anything else —
// a second invocation's claim affects 0 rows and it skips the lead
// entirely.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isPlainDraftUsable } from "../_shared/smsDraft.ts"
import { sendTwilioSms } from "../_shared/twilioSms.ts"
import { notifySlack } from "../_shared/notifySlack.ts"
import { draftSmsWithClaude } from "../_shared/claudeDraft.ts"
import { chunk } from "../_shared/batch.ts"
import { hasStandardAutomation } from "../_shared/tierEligibility.ts"

const LEAD_BATCH_SIZE = 20

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'winback-lost-leads').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    const twilio = { sid: TWILIO_SID, token: TWILIO_TOKEN, from: TWILIO_FROM }
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

    const { data: lostLeads, error } = await supabase
      .from('leads')
      .select('id, business_id, client_name, client_phone, created_at, job_description, urgency, businesses(name, subscription_tier, sector)')
      .eq('status', 'lost')
      .is('lost_winback_sent_at', null)
      .lt('created_at', fourteenDaysAgo) // proxy for "marked lost a while ago" — leads has no status-change timestamp

    if (error) throw error

    // Standard-tier automation gate (added 2026-10-09) — see
    // _shared/tierEligibility.ts's own header and BILLING_INTEGRITY_NOTES.md's
    // "Standard tier had no real differentiator from Starter" entry. The
    // 6th and last of the 6 functions this gates — deferred earlier in
    // this same pass while a separate task was mid-flight fixing the
    // misleading-Slack-message bug just below (now landed, see
    // processOneLostLead).
    const eligible = (lostLeads || []).filter(lead => hasStandardAutomation(lead.businesses?.subscription_tier, lead.businesses?.sector))

    let sent = 0
    // Bounded-concurrency batching (added 2026-10-08) — lost_winback_sent_at
    // self-clears this candidate set in steady state, but the query has no
    // upper age bound, so a real historical backlog (first deployment, or
    // any gap in cron execution) is processed in one run. Same
    // chunk()-of-20 shape as the rest of this round, see
    // SCALE_READINESS_NOTES_ROUND2.md.
    for (const batch of chunk(eligible, LEAD_BATCH_SIZE)) {
      const results = await Promise.all(batch.map(lead =>
        processOneLostLead(supabase, supabaseUrl, supabaseServiceKey, twilio, anthropicKey, lead)
      ))
      for (const wasSent of results) if (wasSent) sent++
    }

    supabase.rpc('record_agent_run', { fn_name: 'winback-lost-leads', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: eligible.length, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('winback-lost-leads error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      createClient(supabaseUrl, supabaseServiceKey)
        .rpc('record_agent_run', { fn_name: 'winback-lost-leads', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Extracted from the main loop (2026-10-08) so it can be run through
// chunk()'s bounded-concurrency batching — same logic that was previously
// inline. Returns whether the SMS send itself reported success.
async function processOneLostLead(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string,
  twilio: { sid: string | undefined; token: string | undefined; from: string | undefined },
  anthropicKey: string | undefined,
  lead: any
): Promise<boolean> {
  // Atomically claim this lead before doing anything else — an
  // overlapping/duplicate daily run could otherwise also see this same
  // not-yet-winback'd lead and text it twice, breaking the "exactly
  // ONE re-engagement SMS" guarantee this function promises. This also
  // now covers the no-phone skip-branch below, so that path no longer
  // needs its own separate update.
  const { data: claimed, error: claimErr } = await supabase
    .from('leads')
    .update({ lost_winback_sent_at: new Date().toISOString() })
    .eq('id', lead.id)
    .eq('status', 'lost')
    .is('lost_winback_sent_at', null)
    .select('id')
  if (claimErr) { console.error('winback-lost-leads: claim failed:', claimErr.message); return false }
  if (!claimed || claimed.length === 0) return false // already claimed by a concurrent run

  if (!lead.client_phone) return false // claimed above so it won't be re-evaluated; nothing more to do

  const bizName = lead.businesses?.name || 'the business'
  const fallbackMessage = `Hi ${lead.client_name || ''}, it's ${bizName} — just checking whether you're still after the work you enquired about a couple of weeks back. No worries either way, just reply if you'd like a quote.`.trim()
  const message = anthropicKey
    ? await draftWinbackSms(anthropicKey, {
        clientName: lead.client_name || '',
        businessName: bizName,
        jobDescription: lead.job_description || '',
        urgency: lead.urgency || 'routine',
        exampleTemplate: fallbackMessage,
      }, fallbackMessage)
    : fallbackMessage

  const smsOk = await sendTwilioSms(twilio, lead.client_phone, message, 'winback-lost-leads')

  await notifySlack(supabaseUrl, supabaseServiceKey, lead.business_id,
    smsOk
      ? `📮 Win-back SMS sent to lost lead *${lead.client_name || 'unknown'}* (marked lost 14+ days ago).`
      : `⚠️ Win-back SMS to lost lead *${lead.client_name || 'unknown'}* (marked lost 14+ days ago) failed to send. Check the number on file.`)

  return smsOk
}

// Asks Claude to draft the one-shot win-back SMS using the lead's original
// request (job_description/urgency) for a bit of relevance. Falls back to
// the exact fixed template if the key is missing, the call fails, or the
// draft looks unusable (empty or too long for an SMS) — this is a
// one-touch-only send so it must never end up empty.
async function draftWinbackSms(
  apiKey: string,
  ctx: { clientName: string; businessName: string; jobDescription: string; urgency: string; exampleTemplate: string },
  fallback: string
): Promise<string> {
  const prompt = `You are drafting a one-time win-back SMS for a home-services business to a lead who was marked 'lost' about 2 weeks ago. Lead name: "${ctx.clientName || 'unknown'}". Business name: "${ctx.businessName}". ${ctx.jobDescription ? `Their original request was: "${ctx.jobDescription}".` : ''} Urgency at the time: "${ctx.urgency}". Style example (match this tone, length, and low-pressure feel exactly — no exclamation marks, no sales pressure, no emoji): "${ctx.exampleTemplate}". Write ONE short SMS (under 300 characters) in the same warm, no-pressure, "no worries either way" voice. Reply with ONLY the SMS text, no quotes, no preamble.`
  return draftSmsWithClaude(apiKey, prompt, fallback, (text) => isPlainDraftUsable(text, 300), 'winback-lost-leads')
}
