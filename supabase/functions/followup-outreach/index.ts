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

const STAGE_DAYS = [3, 7, 14] // stage 1 = 3 days after sent_at, stage 2 = 7 days after stage-1 followup, stage 3 = 14 days after stage-2

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const { data: sentProspects, error } = await supabase
      .from('outreach_prospects')
      .select('*')
      .eq('status', 'sent')
      .is('replied_at', null)
    if (error) throw error

    let drafted = 0, closedLost = 0

    for (const p of sentProspects || []) {
      const stage = p.followup_stage || 0
      if (stage >= STAGE_DAYS.length) {
        await supabase.from('outreach_prospects').update({ status: 'closed_lost' }).eq('id', p.id)
        closedLost++
        continue
      }

      const daysNeeded = STAGE_DAYS[stage]
      const baseline = stage === 0 ? p.sent_at : p.last_followup_sent_at
      if (!baseline) continue
      const dueMs = new Date(baseline).getTime() + daysNeeded * 24 * 60 * 60 * 1000
      if (Date.now() < dueMs) continue

      let subject: string, bodyText: string
      if (anthropicKey) {
        const draft = await draftFollowup(anthropicKey, p, stage + 1)
        if (draft) { subject = draft.subject; bodyText = draft.body }
        else ({ subject, body: bodyText } = fallbackFollowup(p, stage + 1))
      } else {
        ({ subject, body: bodyText } = fallbackFollowup(p, stage + 1))
      }

      await supabase.from('outreach_prospects').update({
        draft_subject: subject,
        draft_body: bodyText,
        status: 'drafted',
        followup_stage: stage + 1,
      }).eq('id', p.id)
      drafted++
    }

    return new Response(JSON.stringify({ success: true, drafted, closedLost }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('followup-outreach error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

function fallbackFollowup(p: any, stage: number): { subject: string; body: string } {
  const name = p.contact_name || 'there'
  return {
    subject: `Re: Quick question for ${p.company_name}`,
    body: `Hi ${name},\n\nJust following up (${stage === 1 ? 'my first note' : `follow-up #${stage}`}) — happy to answer any questions or just send over a link to try it free for 7 days, no pressure either way.\n\n(edit this before sending — this is the plain-template fallback, not an AI-personalized draft)`,
  }
}

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
          content: `Write a brief, polite follow-up (#${stage} of 3) cold-email follow-up to ${p.company_name} (${p.trade_type || 'trade business'}), referencing that this is a follow-up to a prior unanswered email about Minerva (a GPS dispatch/tracking SaaS). Under 60 words, no guilt-tripping, one soft ask (a 7-day free trial or a quick call), sign off "The Minerva team". Reply with ONLY valid JSON: {"subject": string, "body": string}.`,
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
