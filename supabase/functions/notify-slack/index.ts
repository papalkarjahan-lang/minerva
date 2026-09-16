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

  try {
    const { businessId, text }: NotifyPayload = await req.json()
    if (!businessId || !text) {
      return new Response(JSON.stringify({ error: 'Missing businessId or text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

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

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('notify-slack error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
