// Supabase Edge Function: nurture-stale-leads
// Autonomous agent, run hourly via pg_cron (see supabase_schema.sql).
// Two touches, both fully autonomous (no human approval — same "just an
// acknowledgment nudge, not marketing" scope as always, see SECURITY_NOTES.md):
//  - 1st touch, 2h after capture: leads still 'new' with no nurture sent yet
//    get a "we got your message, we'll be in touch" SMS so they don't go
//    cold waiting on a human dispatcher.
//  - 2nd touch, 24h after the 1st: leads that are STILL 'new' (i.e. no
//    human ever moved them to contacted/quoted/lost) get one more short
//    check-in SMS, then are never nurtured again by this function — a
//    business's own dispatcher action, or the Growth pillar's separate
//    quoted-lead win-back flow (generate-growth-drafts), takes over from
//    there.
// Pings Slack on each send so the business knows nurtures are going out.
// Deploy with: supabase functions deploy nurture-stale-leads
//
// Required secrets: same Twilio secrets as the other SMS functions. Optional:
// ANTHROPIC_API_KEY — if set, each SMS is drafted by Claude (same name/
// urgency/business/touch context, styled after the fixed templates below)
// instead of using the fixed template verbatim. If the key is missing, the
// call fails, or Claude's draft looks unusable (empty/too long), this
// function falls back to the EXACT same fixed template string it has always
// used — no behaviour change when no key is configured.
// This function is called with no body (cron passes '{}') — it scans
// across ALL businesses in one run, not just one.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isPlainDraftUsable } from "../_shared/smsDraft.ts"
import { sendTwilioSms } from "../_shared/twilioSms.ts"
import { notifySlack } from "../_shared/notifySlack.ts"
import { draftSmsWithClaude } from "../_shared/claudeDraft.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'nurture-stale-leads').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    const twilio = { sid: TWILIO_SID, token: TWILIO_TOKEN, from: TWILIO_FROM }
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // --- 1st touch ---
    const { data: staleLeads, error } = await supabase
      .from('leads')
      .select('id, business_id, client_name, client_phone, urgency, businesses(name)')
      .eq('status', 'new')
      .is('nurture_sent_at', null)
      .lt('created_at', twoHoursAgo)
      .neq('urgency', 'out_of_scope')

    if (error) throw error

    let sent = 0
    for (const lead of staleLeads || []) {
      if (!lead.client_phone) continue
      const bizName = (lead as any).businesses?.name || 'the business'
      const fallbackMessage = `Hi ${lead.client_name || ''}, thanks for reaching out to ${bizName} — we've received your request and someone will be in touch shortly.`.trim()
      const message = anthropicKey
        ? await draftNurtureSms(anthropicKey, {
            touch: '1st',
            clientName: lead.client_name || '',
            businessName: bizName,
            urgency: lead.urgency || 'routine',
            exampleTemplate: fallbackMessage,
          }, fallbackMessage)
        : fallbackMessage

      const smsOk = await sendTwilioSms(twilio, lead.client_phone, message, 'nurture-stale-leads')

      // Mark as nurtured regardless of SMS success, so we don't retry-storm
      // a lead with a bad phone number every hour.
      await supabase.from('leads').update({ nurture_sent_at: new Date().toISOString() }).eq('id', lead.id)
      if (smsOk) sent++

      await notifySlack(supabaseUrl, supabaseServiceKey, lead.business_id,
        `⏳ Nurture SMS sent to stale lead *${lead.client_name || 'unknown'}* (waiting ${'>'}2hrs untouched).`)
    }

    // --- 2nd touch: still 'new' 24h after the 1st nudge, never a 3rd ---
    const { data: doubleStaleLeads, error: err2 } = await supabase
      .from('leads')
      .select('id, business_id, client_name, client_phone, urgency, businesses(name)')
      .eq('status', 'new')
      .not('nurture_sent_at', 'is', null)
      .is('second_nurture_sent_at', null)
      .lt('nurture_sent_at', twentyFourHoursAgo)
      .neq('urgency', 'out_of_scope')

    if (err2) throw err2

    let sentSecond = 0
    for (const lead of doubleStaleLeads || []) {
      if (!lead.client_phone) continue
      const bizName = (lead as any).businesses?.name || 'the business'
      const fallbackMessage = `Hi ${lead.client_name || ''}, just checking in — ${bizName} still has your request and we're keen to help. Reply here if you'd like to lock in a time.`.trim()
      const message = anthropicKey
        ? await draftNurtureSms(anthropicKey, {
            touch: '2nd',
            clientName: lead.client_name || '',
            businessName: bizName,
            urgency: lead.urgency || 'routine',
            exampleTemplate: fallbackMessage,
          }, fallbackMessage)
        : fallbackMessage

      const smsOk = await sendTwilioSms(twilio, lead.client_phone, message, 'nurture-stale-leads')

      await supabase.from('leads').update({ second_nurture_sent_at: new Date().toISOString() }).eq('id', lead.id)
      if (smsOk) sentSecond++

      await notifySlack(supabaseUrl, supabaseServiceKey, lead.business_id,
        `⏳ Second nurture SMS sent to lead *${lead.client_name || 'unknown'}* (still 'new' 24h after the first nudge — might be worth a personal follow-up).`)
    }

    supabase.rpc('record_agent_run', { fn_name: 'nurture-stale-leads', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({
      success: true,
      scanned: (staleLeads || []).length,
      sent,
      scannedSecondTouch: (doubleStaleLeads || []).length,
      sentSecondTouch: sentSecond,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('nurture-stale-leads error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      createClient(supabaseUrl, supabaseServiceKey)
        .rpc('record_agent_run', { fn_name: 'nurture-stale-leads', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Asks Claude to draft a short SMS in the same voice/length as the fixed
// template (passed in as exampleTemplate). Returns the fixed fallback
// string untouched if the key is missing, the call fails, or the draft
// looks unusable (empty or too long for an SMS) — never blocks the send.
async function draftNurtureSms(
  apiKey: string,
  ctx: { touch: '1st' | '2nd'; clientName: string; businessName: string; urgency: string; exampleTemplate: string },
  fallback: string
): Promise<string> {
  const prompt = `You are drafting the ${ctx.touch} nurture SMS a home-services business sends to a lead who hasn't been contacted yet. Lead name: "${ctx.clientName || 'unknown'}". Business name: "${ctx.businessName}". Lead urgency: "${ctx.urgency}". Style example (match this tone, length, and directness exactly — no exclamation marks, no sales pressure, no emoji): "${ctx.exampleTemplate}". Write ONE short SMS (under 300 characters) in the same warm, non-pushy, plain-English voice as the example. Reply with ONLY the SMS text, no quotes, no preamble, no explanation.`
  return draftSmsWithClaude(apiKey, prompt, fallback, (text) => isPlainDraftUsable(text, 300), 'nurture-stale-leads')
}
