// Supabase Edge Function: draft-outreach-batch
// Solves the real bottleneck in scaling Minerva's own client acquisition:
// one person can only hand-write a handful of genuinely personalized cold
// emails per day. This drafts them at scale — AI writes the words, a human
// still approves every send. It does NOT send anything. See
// send-outreach-batch for the only function that ever calls Resend for
// prospect outreach, and note that one only sends rows already marked
// status='approved' by a human in the admin console.
//
// Direct invocation: { prospectIds?: string[] } — if omitted, drafts every
// outreach_prospects row still at status='new'. For each: asks Claude to
// write a short, specific (not templated/blasted) subject+body referencing
// the prospect's own trade_type/city/company_name, grounded in Minerva's
// real, verified feature set (not aspirational claims) — the prompt below
// explicitly lists only shipped, real capabilities so the AI can't invent
// integrations that don't exist. Writes draft_subject/draft_body and sets
// status='drafted'. A human then reviews/edits each draft in the admin
// console and flips it to 'approved' before send-outreach-batch will ever
// touch it.
//
// Honest fallback: if ANTHROPIC_API_KEY isn't set, or a specific draft call
// fails, that prospect's row is left with a plain-template fallback body
// (not blocked, not skipped) so the admin console always has something to
// review and hand-edit rather than a permanently-stuck 'new' row.
//
// Deploy with: supabase functions deploy draft-outreach-batch
//
// Kill-switch/health wiring added 2026-09-23: this was never registered in
// agent_functions at all, despite being the same AI-drafting-with-honest-
// fallback category as ai-intake-chat (already registered/gated) — found
// via a directory-vs-agent_functions diff. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { fallbackTemplate, appendUnsubscribeIfMissing } from "./logic.ts"

// Only real, shipped, verified capabilities — deliberately not the full
// aspirational pitch deck. Keeps AI-drafted claims honest by construction:
// it literally cannot mention what isn't in this list.
const REAL_FEATURES = `
- Live GPS tracking of technicians on a map, shareable tracking link sent to the customer
- Automated SMS: job assignment, ETA, completion, review request, invoice reminder
- A missed-call auto-text-back (requires pointing a phone number at Minerva)
- An embeddable website chat widget that qualifies leads and texts the team
- Route optimization and wasted-trip detection to cut fuel/drive time
- One-click Xero invoice sync (their own Xero org)
- Safety/compliance incident logging and technician credential-expiry tracking (Industrial tier)
- $49-$119 AUD per technician per month, 7-day free trial, ~20 minute setup, no app install
`.trim()

// Spam Act 2003 (Cth) requires every commercial electronic message to carry
// a functional unsubscribe facility and accurate sender ID. There's no
// reply-parsing webhook in this codebase, so "reply" is the honest
// mechanism — a human then flips outreach_prospects.unsubscribed_at via the
// admin console's "Mark unsubscribed" control, which send-outreach-batch
// and followup-outreach both check before ever touching a row again.
const UNSUBSCRIBE_LINE = "\n\nIf you'd rather not hear from us again, just reply \"unsubscribe\" and we'll stop emailing you — no more follow-ups.\n\n— The Minerva team, sent by Minerva (Antikythera / Krios AI)"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'draft-outreach-batch').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const body = await req.json().catch(() => ({}))
    const prospectIds: string[] | undefined = Array.isArray(body.prospectIds) ? body.prospectIds : undefined

    let query = supabase.from('outreach_prospects').select('*').is('unsubscribed_at', null)
    query = prospectIds ? query.in('id', prospectIds) : query.eq('status', 'new')
    const { data: prospects, error } = await query
    if (error) throw error

    let drafted = 0, aiDrafted = 0, fallbackUsed = 0

    for (const p of prospects || []) {
      let subject: string
      let bodyText: string
      let usedAi = false

      if (anthropicKey) {
        const draft = await draftEmail(anthropicKey, p)
        if (draft) {
          subject = draft.subject
          bodyText = draft.body
          usedAi = true
        } else {
          ;({ subject, body: bodyText } = fallbackTemplate(p))
        }
      } else {
        ;({ subject, body: bodyText } = fallbackTemplate(p))
      }

      bodyText = appendUnsubscribeIfMissing(bodyText, UNSUBSCRIBE_LINE)

      await supabase.from('outreach_prospects').update({
        draft_subject: subject,
        draft_body: bodyText,
        status: 'drafted',
      }).eq('id', p.id)

      drafted++
      if (usedAi) aiDrafted++; else fallbackUsed++
    }

    supabase.rpc('record_agent_run', { fn_name: 'draft-outreach-batch', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, drafted, aiDrafted, fallbackUsed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('draft-outreach-batch error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'draft-outreach-batch', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function draftEmail(apiKey: string, p: any): Promise<{ subject: string; body: string } | null> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: `Write a short, specific, non-generic-sounding cold email pitching Minerva (a GPS dispatch/tracking SaaS for Australian trade businesses) to this prospect:
Company: ${p.company_name}
Contact: ${p.contact_name || '(unknown — address generically but warmly)'}
Trade type: ${p.trade_type || 'unknown trade'}
City: ${p.city || 'unknown'}
Source/context: ${p.source || 'unknown'}

ONLY mention these real, currently-shipped Minerva features — do not invent or imply anything else exists:
${REAL_FEATURES}

Rules: under 120 words, no hype/superlatives, one clear ask (a 10-minute call or a free trial), sign off as "The Minerva team". End the body with a line telling them they can reply "unsubscribe" to stop hearing from us. Reply with ONLY valid JSON: {"subject": string, "body": string}. No markdown, no prose outside the JSON.`,
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
    return { subject: String(parsed.subject).slice(0, 200), body: String(parsed.body).slice(0, 3000) }
  } catch (err) {
    console.error('draft-outreach-batch: AI draft failed', err)
    return null
  }
}
