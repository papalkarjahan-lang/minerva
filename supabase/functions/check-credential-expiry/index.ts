// Supabase Edge Function: check-credential-expiry
// Autonomous agent, run daily via pg_cron (see supabase_schema.sql).
// Licence/Ticket Expiry Guardian — scans technician_credentials for
// expiries crossing 30/14/7-day thresholds and posts ONE internal Slack
// notification per threshold crossed per credential (never a client SMS —
// this is purely an internal compliance nudge for the dispatcher/owner).
// Also sends an immediate, higher-urgency Slack ping if a technician who
// currently has a job assigned (current_job_id set) has a credential that
// is already expired or expires within 3 days — that's the case where a
// technician could be on-site right now without a valid ticket.
//
// Deploy with: supabase functions deploy check-credential-expiry
// No Twilio secrets needed — this function never sends a client-facing SMS.
//
// Optional: ANTHROPIC_API_KEY — if set, every threshold crossing/urgent ping
// also gets a one-sentence Claude note on what to check/do first, written to
// `agent_insights` alongside a plain-English fallback note that's ALWAYS
// written regardless of whether the key is present.

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
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const now = new Date()
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const in14 = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const in3 = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    const { data: credentials, error } = await supabase
      .from('technician_credentials')
      .select('id, business_id, technician_id, credential_name, expiry_date, warning_30_sent_at, warning_14_sent_at, warning_7_sent_at, technicians(name, current_job_id)')
    if (error) throw error

    let warned30 = 0, warned14 = 0, warned7 = 0, urgentPings = 0

    for (const cred of credentials || []) {
      const tech = (cred as any).technicians
      const techName = tech?.name || 'a technician'

      // 30-day threshold
      if (!cred.warning_30_sent_at && cred.expiry_date <= in30 && cred.expiry_date > in14) {
        await notifySlack(supabaseUrl, supabaseAnonKey, cred.business_id,
          `📋 *${techName}*'s ${cred.credential_name || 'credential'} expires ${cred.expiry_date} (30 days away).`)
        await supabase.from('technician_credentials').update({ warning_30_sent_at: new Date().toISOString() }).eq('id', cred.id)
        warned30++
        await writeCredentialInsight(supabase, anthropicKey, cred, techName,
          `Renewal not yet due but worth starting: ${techName}'s ${cred.credential_name || 'credential'} expires in 30 days (${cred.expiry_date}).`,
          `A dispatcher for a home-services business just got a 30-day heads-up that technician "${techName}"'s credential "${cred.credential_name || 'credential'}" expires on ${cred.expiry_date}. Give one short, practical sentence on what to check or do first at this early stage.`)
      }
      // 14-day threshold
      if (!cred.warning_14_sent_at && cred.expiry_date <= in14 && cred.expiry_date > in7) {
        await notifySlack(supabaseUrl, supabaseAnonKey, cred.business_id,
          `📋 *${techName}*'s ${cred.credential_name || 'credential'} expires ${cred.expiry_date} (14 days away).`)
        await supabase.from('technician_credentials').update({ warning_14_sent_at: new Date().toISOString() }).eq('id', cred.id)
        warned14++
        await writeCredentialInsight(supabase, anthropicKey, cred, techName,
          `Renewal window closing: ${techName}'s ${cred.credential_name || 'credential'} expires in 14 days (${cred.expiry_date}).`,
          `A dispatcher for a home-services business just got a 14-day warning that technician "${techName}"'s credential "${cred.credential_name || 'credential'}" expires on ${cred.expiry_date}. Give one short, practical sentence on what to check or do first now that the window is closing.`)
      }
      // 7-day threshold
      if (!cred.warning_7_sent_at && cred.expiry_date <= in7) {
        await notifySlack(supabaseUrl, supabaseAnonKey, cred.business_id,
          `📋 *${techName}*'s ${cred.credential_name || 'credential'} expires ${cred.expiry_date} (7 days or less).`)
        await supabase.from('technician_credentials').update({ warning_7_sent_at: new Date().toISOString() }).eq('id', cred.id)
        warned7++
        await writeCredentialInsight(supabase, anthropicKey, cred, techName,
          `Urgent renewal window: ${techName}'s ${cred.credential_name || 'credential'} expires within 7 days (${cred.expiry_date}).`,
          `A dispatcher for a home-services business just got a 7-day-or-less warning that technician "${techName}"'s credential "${cred.credential_name || 'credential'}" expires on ${cred.expiry_date}. Give one short, practical sentence on the single most useful thing to do right now.`)
      }

      // Urgent: expired-or-expiring-within-3-days AND currently on a job.
      if (cred.expiry_date <= in3 && tech?.current_job_id) {
        const expired = cred.expiry_date < now.toISOString().slice(0, 10)
        await notifySlack(supabaseUrl, supabaseAnonKey, cred.business_id,
          `🚨 *${techName}* is currently on a job with ${expired ? 'an EXPIRED' : 'a credential expiring within 3 days'}: ${cred.credential_name || 'credential'} (expiry ${cred.expiry_date}). Worth a same-day check.`)
        urgentPings++
        await writeCredentialInsight(supabase, anthropicKey, cred, techName,
          `${techName} is currently on a job with ${expired ? 'an EXPIRED' : 'a credential expiring within 3 days'} (${cred.credential_name || 'credential'}, expiry ${cred.expiry_date}) — worth a same-day check.`,
          `A dispatcher for a home-services business just got an urgent alert: technician "${techName}" is CURRENTLY assigned to a job while their credential "${cred.credential_name || 'credential'}" is ${expired ? 'already EXPIRED' : 'expiring within 3 days'} (expiry ${cred.expiry_date}). Give one short, practical sentence on the single most useful same-day action.`)
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'check-credential-expiry', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({
      success: true,
      scanned: (credentials || []).length,
      warned30, warned14, warned7, urgentPings,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('check-credential-expiry error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'check-credential-expiry', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function notifySlack(supabaseUrl: string, supabaseAnonKey: string, businessId: string, text: string) {
  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ businessId, text }),
  }).catch(() => {})
}

// Writes an agent_insights row for a detected credential issue. summary is
// the AI-drafted reasoning note when a key is present and the call
// succeeds, otherwise the plain-English fallback — the row is ALWAYS
// written either way, never blocking the function's core Slack-alert path.
async function writeCredentialInsight(
  supabase: ReturnType<typeof createClient>,
  anthropicKey: string | undefined,
  cred: { id: string; business_id: string },
  _techName: string,
  fallbackSummary: string,
  aiPrompt: string
) {
  const summary = anthropicKey ? await draftReasoning(anthropicKey, aiPrompt, fallbackSummary) : fallbackSummary
  await supabase.from('agent_insights').insert({
    agent: 'finance',
    insight_type: 'anomaly',
    summary,
    business_id: cred.business_id,
    related_table: 'technician_credentials',
    related_id: cred.id,
  }).then(() => {}, (insErr) => console.error('check-credential-expiry: agent_insights insert failed', insErr))
}

// Asks Claude for a one-sentence best-guess/practical note. Returns the
// plain-English fallback if the key is missing, the call fails, or the
// response looks empty/unusable.
async function draftReasoning(apiKey: string, prompt: string, fallback: string): Promise<string> {
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
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) return fallback
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    if (!text) return fallback
    return text
  } catch (err) {
    console.error('check-credential-expiry: reasoning draft failed', err)
    return fallback
  }
}
