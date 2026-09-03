// Supabase Edge Function: chase-unpaid-invoices
// Autonomous agent, run daily via pg_cron (see supabase_schema.sql).
// Finds invoices still 'unpaid' 3+ days after creation, with no reminder
// sent in the last 3 days, and sends the client a payment-reminder SMS
// with a link back to their invoice (InvoiceView.jsx). Re-sends every
// 3 days for as long as the invoice stays unpaid (throttled by
// reminder_sent_at, not a hard cap — a business can mark it paid to stop
// the reminders at any time).
// Deploy with: supabase functions deploy chase-unpaid-invoices
//
// Required secrets: same Twilio secrets as the other SMS functions, plus
// APP_URL (same one used by stripe-webhook / send-invoice-sms) to build
// the invoice link. Optional: ANTHROPIC_API_KEY — if set, the reminder copy
// is drafted by Claude, told how many reminders have already gone out and
// how overdue the invoice is so it can modulate tone (friendly nudge on the
// first reminder, firmer follow-up on later ones) — the escalation LOGIC
// (which invoices get touched, on what cadence) is unchanged, only the
// wording. The drafted text must still contain the exact dollar amount and
// invoice link or it's discarded in favour of the fixed template; same
// fixed template is used outright if the key is missing or the call fails.

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

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'chase-unpaid-invoices').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    const APP_URL = Deno.env.get('APP_URL') || ''
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()

    const { data: unpaid, error } = await supabase
      .from('invoices')
      .select('id, business_id, client_name, client_phone, total, created_at, reminder_sent_at, reminder_count, line_items, businesses(name)')
      .eq('status', 'unpaid')
      .lt('created_at', threeDaysAgo)
      .or(`reminder_sent_at.is.null,reminder_sent_at.lt.${threeDaysAgo}`)

    if (error) throw error

    let sent = 0
    for (const inv of unpaid || []) {
      if (!inv.client_phone) continue
      const bizName = (inv as any).businesses?.name || 'the business'
      const link = `${APP_URL}/invoice/${inv.id}`

      let smsOk = false
      if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM) {
        let phone = inv.client_phone.replace(/\s/g, '')
        if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
        if (!phone.startsWith('+')) phone = '+61' + phone

        const amount = Number(inv.total).toFixed(2)
        const fallbackMessage = `Hi ${inv.client_name || ''}, this is a friendly reminder that your invoice from ${bizName} for $${amount} is still unpaid. View it here: ${link}`.trim()

        const daysOverdue = Math.floor((Date.now() - new Date(inv.created_at).getTime()) / (24 * 60 * 60 * 1000))
        const priorReminders = inv.reminder_count || 0
        const jobDescription = Array.isArray((inv as any).line_items)
          ? (inv as any).line_items.map((li: any) => li?.description).filter(Boolean).join(', ')
          : ''

        const message = anthropicKey
          ? await draftReminderSms(anthropicKey, {
              clientName: inv.client_name || '',
              businessName: bizName,
              amount,
              link,
              daysOverdue,
              priorReminders,
              jobDescription,
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
        }).catch(err => { console.error('chase-unpaid-invoices: SMS failed', err); return null })

        if (res) {
          const result = await res.json().catch(() => ({}))
          smsOk = !result.error_code
        }
      }

      await supabase.from('invoices').update({
        reminder_sent_at: new Date().toISOString(),
        reminder_count: (inv.reminder_count || 0) + 1,
      }).eq('id', inv.id)
      if (smsOk) sent++

      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          businessId: inv.business_id,
          text: `💰 Payment reminder sent for unpaid invoice ($${Number(inv.total).toFixed(2)}) — *${inv.client_name || 'unknown client'}*.`,
        }),
      }).catch(() => {})
    }

    supabase.rpc('record_agent_run', { fn_name: 'chase-unpaid-invoices', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: (unpaid || []).length, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('chase-unpaid-invoices error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'chase-unpaid-invoices', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Asks Claude to draft a reminder that keeps the same required facts (dollar
// amount, invoice link) but modulates tone by how many reminders have
// already gone out and how overdue the invoice is (friendlier early,
// firmer later). Falls back to the exact fixed template if the key is
// missing, the call fails, or the draft drops the required amount/link or
// runs long — never risks sending a reminder that's missing the link.
async function draftReminderSms(
  apiKey: string,
  ctx: {
    clientName: string; businessName: string; amount: string; link: string
    daysOverdue: number; priorReminders: number; jobDescription: string; exampleTemplate: string
  },
  fallback: string
): Promise<string> {
  try {
    const tonePrompt = ctx.priorReminders >= 2
      ? 'This is at least the 3rd reminder — the tone should be firmer and more direct (still polite, no threats), making clear payment is now overdue.'
      : ctx.priorReminders === 1
      ? 'This is the 2nd reminder — a bit more direct than a first nudge, but still friendly.'
      : 'This is the first reminder — keep it light and friendly, assume they just forgot.'

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
          content: `You are drafting a payment-reminder SMS for a home-services business. Client name: "${ctx.clientName || 'unknown'}". Business name: "${ctx.businessName}". Invoice amount: $${ctx.amount}. Invoice link (must appear verbatim, unmodified, exactly once): ${ctx.link}. Days overdue: ${ctx.daysOverdue}. Prior reminders already sent for this invoice: ${ctx.priorReminders}. ${ctx.jobDescription ? `Job was for: ${ctx.jobDescription}.` : ''} ${tonePrompt} Style example (match length and plain-English directness): "${ctx.exampleTemplate}". Write ONE short SMS (under 320 characters) that includes the exact dollar amount "$${ctx.amount}" and the exact link "${ctx.link}" verbatim. Reply with ONLY the SMS text, no quotes, no preamble.`,
        }],
      }),
    })

    if (!res.ok) return fallback
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    if (!text || text.length > 320) return fallback
    if (!text.includes(ctx.link) || !text.includes(ctx.amount)) return fallback
    return text
  } catch (err) {
    console.error('chase-unpaid-invoices: draft failed', err)
    return fallback
  }
}
