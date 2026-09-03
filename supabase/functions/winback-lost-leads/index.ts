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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
      .select('id, business_id, client_name, client_phone, created_at, job_description, urgency, businesses(name)')
      .eq('status', 'lost')
      .is('lost_winback_sent_at', null)
      .lt('created_at', fourteenDaysAgo) // proxy for "marked lost a while ago" — leads has no status-change timestamp

    if (error) throw error

    let sent = 0
    for (const lead of lostLeads || []) {
      if (!lead.client_phone) {
        // still mark it so a lead with no phone doesn't get re-evaluated forever
        await supabase.from('leads').update({ lost_winback_sent_at: new Date().toISOString() }).eq('id', lead.id)
        continue
      }
      const bizName = (lead as any).businesses?.name || 'the business'
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

      const smsOk = await sendSms(twilio, lead.client_phone, message)
      await supabase.from('leads').update({ lost_winback_sent_at: new Date().toISOString() }).eq('id', lead.id)
      if (smsOk) sent++

      await notifySlack(supabaseUrl, supabaseAnonKey, lead.business_id,
        `📮 Win-back SMS sent to lost lead *${lead.client_name || 'unknown'}* (marked lost 14+ days ago).`)
    }

    supabase.rpc('record_agent_run', { fn_name: 'winback-lost-leads', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: (lostLeads || []).length, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('winback-lost-leads error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'winback-lost-leads', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

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
        max_tokens: 150,
        messages: [{
          role: 'user',
          content: `You are drafting a one-time win-back SMS for a home-services business to a lead who was marked 'lost' about 2 weeks ago. Lead name: "${ctx.clientName || 'unknown'}". Business name: "${ctx.businessName}". ${ctx.jobDescription ? `Their original request was: "${ctx.jobDescription}".` : ''} Urgency at the time: "${ctx.urgency}". Style example (match this tone, length, and low-pressure feel exactly — no exclamation marks, no sales pressure, no emoji): "${ctx.exampleTemplate}". Write ONE short SMS (under 300 characters) in the same warm, no-pressure, "no worries either way" voice. Reply with ONLY the SMS text, no quotes, no preamble.`,
        }],
      }),
    })

    if (!res.ok) return fallback
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    if (!text || text.length > 300) return fallback
    return text
  } catch (err) {
    console.error('winback-lost-leads: draft failed', err)
    return fallback
  }
}

async function sendSms(
  twilio: { sid?: string; token?: string; from?: string },
  rawPhone: string,
  message: string
): Promise<boolean> {
  if (!twilio.sid || !twilio.token || !twilio.from) return false

  let phone = rawPhone.replace(/\s/g, '')
  if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
  if (!phone.startsWith('+')) phone = '+61' + phone

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${twilio.sid}:${twilio.token}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: phone, From: twilio.from, Body: message }).toString(),
  }).catch(err => { console.error('winback-lost-leads: SMS failed', err); return null })

  if (!res) return false
  const result = await res.json().catch(() => ({}))
  return !result.error_code
}

async function notifySlack(supabaseUrl: string, supabaseAnonKey: string, businessId: string, text: string) {
  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ businessId, text }),
  }).catch(() => {})
}
