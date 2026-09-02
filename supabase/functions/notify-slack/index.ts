// Supabase Edge Function: notify-slack
// Generic Slack notifier used by other functions/agents (ai-intake-chat,
// nurture-stale-leads, chase-unpaid-invoices, auto-assign-technician,
// daily-digest) to post an alert into a business's own Slack workspace.
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

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

    const slackRes = await fetch(business.slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
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
