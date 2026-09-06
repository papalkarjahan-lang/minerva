// Supabase Edge Function: run-custom-workflows
// The general-purpose "customized via chat" agent — lets a business define
// simple automation rules (trigger -> optional condition -> action) without
// Minerva needing a bespoke edge function per business. A business sets
// these up via the Custom Workflows section of the Settings modal (plain
// form today; "configure via chat" = describe the rule in Settings' free-
// text description field, a human/future assistant translates it into the
// trigger/condition/action row — this function only executes already-saved
// rows, it doesn't itself parse natural language).
//
// Two ways this runs:
//  1. Cron sweep (every 15 min, no body) — checks 'job.completed' and
//     'invoice.paid' style triggers by scanning for rows updated since the
//     last sweep isn't tracked per-row, so those two triggers are handled
//     by the OTHER functions that already own that event (see below) via a
//     direct POST with a body instead of this function polling for them.
//  2. Direct invocation with a body: { businessId, event, payload } — called
//     fire-and-forget from wherever the event actually happens (e.g.
//     ai-intake-chat after inserting a lead, DispatcherView after marking a
//     job complete or an invoice paid). This is the same "internal function
//     calling another function" pattern already used by notify-slack.
//
// Action types:
//  - 'webhook': POSTs { event, business_id, payload } as JSON to
//    action_target (the business's own external URL — Zapier, a custom
//    endpoint, Salesforce/Shopify's own inbound webhook URL, etc. Minerva
//    doesn't hold direct Salesforce/Shopify credentials — the business
//    points their own webhook-receiving integration at this).
//  - 'slack': posts a formatted line to the business's already-configured
//    slack_webhook_url via notify-slack, no separate secret needed.
//
// Deploy with: supabase functions deploy run-custom-workflows

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

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'run-custom-workflows').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    let businessId: string | null = null
    let event: string | null = null
    let payload: Record<string, any> = {}

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      businessId = body.businessId || null
      event = body.event || null
      payload = body.payload || {}
    }

    // Direct invocation: run only this business's workflows for this one event.
    if (businessId && event) {
      const result = await runWorkflowsFor(supabase, supabaseUrl, supabaseAnonKey, businessId, event, payload)
      supabase.rpc('record_agent_run', { fn_name: 'run-custom-workflows', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Cron sweep with no body: nothing to poll for currently (both supported
    // triggers are event-driven via direct invocation above), so this is a
    // harmless no-op tick kept for forward-compatibility with future
    // time-based trigger types (e.g. 'invoice.overdue').
    supabase.rpc('record_agent_run', { fn_name: 'run-custom-workflows', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, note: 'no time-based triggers configured' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('run-custom-workflows error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'run-custom-workflows', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function runWorkflowsFor(
  supabase: any,
  supabaseUrl: string,
  supabaseAnonKey: string,
  businessId: string,
  event: string,
  payload: Record<string, any>
) {
  const { data: workflows, error } = await supabase
    .from('custom_workflows')
    .select('id, name, condition_field, condition_op, condition_value, action_type, action_target')
    .eq('business_id', businessId)
    .eq('trigger_event', event)
    .eq('active', true)
  if (error) throw error

  let ran = 0
  let skipped = 0

  for (const wf of workflows || []) {
    const matches = matchesCondition(payload, wf.condition_field, wf.condition_op, wf.condition_value)
    if (!matches) {
      skipped++
      await logRun(supabase, wf.id, businessId, event, 'skipped_no_match', 'condition did not match')
      continue
    }

    try {
      if (wf.action_type === 'webhook') {
        await fetch(wf.action_target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ event, business_id: businessId, payload }),
        })
      } else if (wf.action_type === 'slack') {
        await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
          body: JSON.stringify({ businessId, text: `🔧 Workflow *${wf.name}* triggered by ${event}` }),
        })
      }
      ran++
      await logRun(supabase, wf.id, businessId, event, 'sent', `matched, action=${wf.action_type}`)
    } catch (err) {
      await logRun(supabase, wf.id, businessId, event, 'failed', String(err))
    }
  }

  return { evaluated: (workflows || []).length, ran, skipped }
}

function matchesCondition(
  payload: Record<string, any>,
  field: string | null,
  op: string | null,
  value: string | null
): boolean {
  if (!field || !op) return true // no condition set = always match
  const actual = payload?.[field]
  if (actual === undefined || actual === null) return false

  switch (op) {
    case 'eq': return String(actual) === String(value)
    case 'neq': return String(actual) !== String(value)
    case 'gt': return Number(actual) > Number(value)
    case 'lt': return Number(actual) < Number(value)
    case 'contains': return String(actual).toLowerCase().includes(String(value || '').toLowerCase())
    default: return true
  }
}

async function logRun(supabase: any, workflowId: string, businessId: string, event: string, status: string, detail: string) {
  await supabase.from('workflow_runs').insert({
    workflow_id: workflowId,
    business_id: businessId,
    trigger_event: event,
    status,
    detail,
  }).catch(() => {})
}
