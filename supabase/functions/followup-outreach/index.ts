// Supabase Edge Function: followup-outreach
// Cron sweep (daily) — the automated version of "remember to follow up."
// Finds outreach_prospects at status='sent' with no replied_at, whose
// sent_at (or last_followup_sent_at, for stage 2/3) has crossed the 3/7/14
// day mark, and DRAFTS the next follow-up into draft_subject/draft_body,
// setting status back to 'drafted' so it goes through the exact same
// human-review/approve step as an initial outreach email — this function
// never sends anything itself, same non-negotiable boundary as
// draft-outreach-batch. Increments followup_stage so a prospect only ever
// gets drafted once per stage per day (not re-drafted every daily run).
//
// After 3 follow-ups with no reply, sets status='closed_lost' instead of
// drafting a 4th — repeatedly emailing someone who hasn't replied 3 times
// is what makes cold outreach counterproductive, not more effective.
//
// Deploy with: supabase functions deploy followup-outreach

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { computeFollowupDecision, fallbackFollowup } from "./logic.ts"

// Spam Act 2003 (Cth) opt-out line — see draft-outreach-batch/index.ts for
// the full rationale. A prospect who replied "unsubscribe" gets marked via
// unsubscribed_at in the admin console; this function must never draft a
// further follow-up for them.
const UNSUBSCRIBE_LINE = "\n\nIf you'd rather not hear from us again, just reply \"unsubscribe\" and we'll stop emailing you — no more follow-ups.\n\n— The Minerva team, sent by Minerva (Antikythera / Krios AI)"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    // Was deployed+scheduled without ever being registered in
    // agent_functions — see supabase_schema_delta_followup_outreach_agent_registration.sql
    // for the backfill and the same bug class it was previously found under
    // in supabase_schema_delta_operational_fixes.sql. Kill-switch + health
    // tracking only work once a row actually exists.
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'followup-outreach').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: sentProspects, error } = await supabase
      .from('outreach_prospects')
      .select('*')
      .eq('status', 'sent')
      .is('replied_at', null)
      .is('unsubscribed_at', null)
    if (error) throw error

    let drafted = 0, closedLost = 0

    for (const p of sentProspects || []) {
      const decision = computeFollowupDecision(p, Date.now())
      if (decision.action === 'close_lost') {
        await supabase.from('outreach_prospects').update({ status: 'closed_lost' }).eq('id', p.id)
        closedLost++
        continue
      }
      if (decision.action === 'wait') continue

      const nextStage = decision.nextStage
      let subject: string, bodyText: string
      if (anthropicKey) {
        const draft = await draftFollowup(anthropicKey, p, nextStage)
        if (draft) { subject = draft.subject; bodyText = draft.body }
        else ({ subject, body: bodyText } = fallbackFollowup(p, nextStage))
      } else {
        ({ subject, body: bodyText } = fallbackFollowup(p, nextStage))
      }

      if (!bodyText.includes('unsubscribe')) bodyText += UNSUBSCRIBE_LINE

      await supabase.from('outreach_prospects').update({
        draft_subject: subject,
        draft_body: bodyText,
        status: 'drafted',
        followup_stage: nextStage,
      }).eq('id', p.id)
      drafted++
    }

    await supabase.rpc('record_agent_run', { fn_name: 'followup-outreach', status: 'ok' })
    return new Response(JSON.stringify({ success: true, drafted, closedLost }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('followup-outreach error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      await supabase.rpc('record_agent_run', { fn_name: 'followup-outreach', status: 'error', error_msg: err.message })
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function draftFollowup(apiKey: string, p: any, stage: number): Promise<{ subject: string; body: string } | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Write a brief, polite follow-up (#${stage} of 3) cold-email follow-up to ${p.company_name} (${p.trade_type || 'trade business'}), referencing that this is a follow-up to a prior unanswered email about Minerva (a GPS dispatch/tracking SaaS). Under 60 words, no guilt-tripping, one soft ask (a 7-day free trial or a quick call), sign off "The Minerva team". End with a line telling them they can reply "unsubscribe" to stop hearing from us. Reply with ONLY valid JSON: {"subject": string, "body": string}.`,
        }],
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const parsed = JSON.parse(jsonMatch[0])
    if (!parsed?.subject || !parsed?.body) return null
    return { subject: String(parsed.subject).slice(0, 200), body: String(parsed.body).slice(0, 2000) }
  } catch (err) {
    console.error('followup-outreach: AI draft failed', err)
    return null
  }
}
