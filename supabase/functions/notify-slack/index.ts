// Supabase Edge Function: notify-slack
// Generic Slack notifier used by other functions/agents (ai-intake-chat,
// nurture-stale-leads, chase-unpaid-invoices, auto-assign-technician,
// daily-digest, and ~10 others) to post an alert into a business's own
// Slack workspace.
// Deploy with: supabase functions deploy notify-slack
//
// This function takes a businessId, looks up that business's
// slack_webhook_url (pasted in by the business owner via the Settings
// modal in DispatcherView), and posts the message to it. If the business
// hasn't configured Slack, this is a silent no-op (not an error) — Slack
// is optional, everything else in Minerva works without it.
//
// Called internally by other edge functions (server-to-server), so this
// is deployed WITHOUT --no-verify-jwt like the rest of the internal
// functions — callers pass Authorization: Bearer <anon key>.
//
// Formatting (2026-09-14): every caller still just sends plain
// {businessId, text} — nothing upstream changed. This function now turns
// that into a proper Slack Block Kit message instead of a flat text blob:
//   - a header block showing which agent raised it (parsed from the
//     existing "<emoji> *Name*: ..." convention every caller already uses)
//   - the message body as a section block (mrkdwn, so existing *bold*
//     markup keeps working unchanged)
//   - a context block with a Slack-native localized timestamp
//     (<!date^...>, renders in each viewer's own timezone) and a
//     "Minerva" byline
//   - a colored side-bar (via `attachments`) — red for emergencies/safety,
//     amber for warnings, green for money/wins, Slack's own aubergine
//     purple as the default — so people can eyeball urgency in the
//     channel sidebar without opening the message
//   - an "Open Dispatcher" button (only if APP_URL is configured) linking
//     straight to that business's dispatcher view
// `text` is still sent as the top-level fallback string (Slack requires
// this for push notifications and screen readers when blocks are used).
//
// Health/kill-switch wiring added 2026-09-23: this was registered in
// agent_functions but never actually checked `enabled` or called
// `record_agent_run` — meaning a platform-wide "pause all Slack alerts"
// toggle silently did nothing, and this being broken (it's a dependency
// of ~36 other functions) was invisible. Same bug class as the
// sync-technician-billing/followup-outreach fix from 2026-09-22.
//
// Fixed 2026-09-24 (Round 43 continued): had zero caller-identity check of
// any kind, and unlike the SMS functions the message body (`text`) is
// taken 100% verbatim from the request — no template, no DB-derived
// content at all. Confirmed (grepped every caller in src/ and
// supabase/functions/) that this function has NO legitimate frontend call
// site — every real caller is another edge function passing
// `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` server-to-server.
// So the public anon key alone let any caller post arbitrary attacker-
// controlled text to a stranger's real Slack channel via their
// slack_webhook_url — an open Slack-message relay, the same risk class as
// the SMS-relay gap fixed earlier this round but with zero content
// template constraining it at all. Fixed by requiring the caller to
// present the real service-role key — the one secret only Minerva's own
// functions ever have — closing the gap with no behavior change for any
// legitimate caller.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { colorFor, parseAgentMessage } from "./logic.ts"

interface NotifyPayload {
  businessId: string
  text: string
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    // Internal-service-only — see header note. Every legitimate caller is
    // another edge function passing the real service-role key; there is no
    // legitimate frontend/end-user caller of this function at all.
    const authHeader = req.headers.get('Authorization') || ''
    if (authHeader.replace(/^Bearer\s+/i, '') !== supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'notify-slack').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { businessId, text }: NotifyPayload = await req.json()
    if (!businessId || !text) {
      return new Response(JSON.stringify({ error: 'Missing businessId or text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('slack_webhook_url')
      .eq('id', businessId)
      .single()

    if (!business?.slack_webhook_url) {
      // No Slack configured for this business — not an error.
      return new Response(JSON.stringify({ success: true, skipped: 'no_webhook_configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { emoji, agent, body } = parseAgentMessage(text)
    const headerText = agent ? `${emoji ? emoji + ' ' : ''}${agent}` : '🔔 Minerva'
    const nowUnix = Math.floor(Date.now() / 1000)

    const blocks: Record<string, unknown>[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: headerText.slice(0, 150), emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: body },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Minerva  •  <!date^${nowUnix}^{date_short_pretty} at {time}|just now>`,
          },
        ],
      },
    ]

    const appUrl = Deno.env.get('APP_URL')
    if (appUrl) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Open Dispatcher', emoji: true },
            url: `${appUrl}/dispatch/${businessId}`,
            action_id: 'open_dispatcher',
          },
        ],
      })
    }

    const slackRes = await fetch(business.slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text, // fallback for notifications/screen readers
        attachments: [
          {
            color: colorFor(emoji),
            blocks,
          },
        ],
      }),
    })

    if (!slackRes.ok) {
      const errText = await slackRes.text()
      throw new Error(`Slack webhook error ${slackRes.status}: ${errText}`)
    }

    supabase.rpc('record_agent_run', { fn_name: 'notify-slack', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('notify-slack error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'notify-slack', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
