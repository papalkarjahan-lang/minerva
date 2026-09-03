// Supabase Edge Function: retention-checkin
// Autonomous agent, run weekly via pg_cron. Finds clients whose most
// recent completed job was 30+ days ago with no newer job or lead since
// (i.e. they haven't come back), and haven't already had a retention SMS
// sent for that job, and sends a short, low-pressure "need anything
// else?" check-in. This is post-sale relationship maintenance with an
// EXISTING client, not cold outreach to a new prospect — scoped the same
// way as nurture-stale-leads / chase-unpaid-invoices.
// Deploy with: supabase functions deploy retention-checkin
//
// Required secrets: same Twilio secrets as the other SMS functions. Optional:
// ANTHROPIC_API_KEY — if set, the check-in SMS is drafted by Claude using
// the client's last job context (notes/completion date) instead of the
// fixed template. Falls back to the EXACT existing template if the key is
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

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'retention-checkin').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()

    // Completed 30-60 days ago (a window, not "30+ forever", so this agent
    // doesn't keep re-scanning years-old jobs every week once retention_sent_at
    // logic below already excludes them anyway — the window just keeps the
    // query cheap).
    const { data: candidates, error } = await supabase
      .from('jobs')
      .select('id, business_id, client_name, client_phone, completed_at, notes, businesses(name)')
      .eq('status', 'complete')
      .is('retention_sent_at', null)
      .gte('completed_at', sixtyDaysAgo)
      .lt('completed_at', thirtyDaysAgo)

    if (error) throw error

    let sent = 0
    for (const job of candidates || []) {
      if (!job.client_phone) continue

      // Skip if this client already has a newer job (any status) since —
      // they're already back, no need to nudge them.
      const { count: newerJobs } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('business_id', job.business_id)
        .eq('client_phone', job.client_phone)
        .gt('created_at', job.completed_at)
      if ((newerJobs ?? 0) > 0) {
        await supabase.from('jobs').update({ retention_sent_at: new Date().toISOString() }).eq('id', job.id)
        continue
      }

      const bizName = (job as any).businesses?.name || 'us'
      let smsOk = false
      if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        let phone = job.client_phone.replace(/\s/g, '')
        if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
        if (!phone.startsWith('+')) phone = '+61' + phone

        const fallbackMessage = `Hi ${job.client_name || ''}, it's been a little while since ${bizName} last helped you out — just checking in, let us know if you need anything.`.trim()
        const message = anthropicKey
          ? await draftCheckinSms(anthropicKey, {
              clientName: job.client_name || '',
              businessName: bizName,
              lastJobNotes: job.notes || '',
              completedAt: job.completed_at,
              exampleTemplate: fallbackMessage,
            }, fallbackMessage)
          : fallbackMessage

        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: message }).toString(),
        }).catch(err => { console.error('retention-checkin: SMS failed', err); return null })

        if (res) {
          const result = await res.json().catch(() => ({}))
          smsOk = !result.error_code
        }
      }

      await supabase.from('jobs').update({ retention_sent_at: new Date().toISOString() }).eq('id', job.id)
      if (smsOk) sent++
    }

    supabase.rpc('record_agent_run', { fn_name: 'retention-checkin', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: (candidates || []).length, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('retention-checkin error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'retention-checkin', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Asks Claude to draft a short check-in SMS using the client's last-job
// context (notes/date) for a bit of personalization. Falls back to the
// exact fixed template if the key is missing, the call fails, or the
// draft looks unusable (empty or too long for an SMS).
async function draftCheckinSms(
  apiKey: string,
  ctx: { clientName: string; businessName: string; lastJobNotes: string; completedAt: string; exampleTemplate: string },
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
          content: `You are drafting a low-pressure retention check-in SMS for a home-services business. Client name: "${ctx.clientName || 'unknown'}". Business name: "${ctx.businessName}". Their last completed job was on ${ctx.completedAt}${ctx.lastJobNotes ? `, notes from that job: "${ctx.lastJobNotes}"` : ''}. Style example (match this tone, length, and low-pressure feel exactly — no exclamation marks, no sales pitch, no emoji): "${ctx.exampleTemplate}". Write ONE short SMS (under 300 characters) in the same warm, low-pressure voice. Reply with ONLY the SMS text, no quotes, no preamble.`,
        }],
      }),
    })

    if (!res.ok) return fallback
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    if (!text || text.length > 300) return fallback
    return text
  } catch (err) {
    console.error('retention-checkin: draft failed', err)
    return fallback
  }
}
