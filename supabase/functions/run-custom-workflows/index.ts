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
//  1. Cron sweep (every 15 min, no body) — 'job.completed' and 'invoice.paid'
//     are event-driven via direct invocation (see below), so nothing to poll
//     for there. 'invoice.overdue' (added 2026-09-27) IS time-based, so the
//     sweep itself finds qualifying invoices: unpaid, created 3+ days ago
//     (the same "chase-worthy" threshold chase-unpaid-invoices already
//     uses), and not yet notified for this trigger. Claimed atomically via
//     invoices.workflow_overdue_notified_at (UPDATE ... WHERE still null,
//     checked via .select() returning the claimed row) BEFORE running any
//     workflow — same claim-before-send pattern as nurture-stale-leads,
//     preventing an overlapping sweep from double-firing the same invoice.
//     Fires once per invoice ever, not on a recurring cadence — a business
//     wanting repeated overdue nags already has chase-unpaid-invoices SMS
//     for that; this is for a DIFFERENT one-time action (e.g. Slack the
//     accounts team, or hit an external collections webhook).
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
//
// Fixed 2026-09-24 (Round 43 continued): zero caller-identity check —
// direct invocation with just { businessId, event, payload } and the
// public anon key let anyone force-fire a stranger's configured workflows
// (an arbitrary POST to their action_target webhook URL, or a Slack
// message, both carrying attacker-controlled `payload`) — same forged-
// trigger risk class as elsewhere this round, worse here because the
// attacker also controls `payload`, which feeds directly into the
// webhook body and the condition match. Two real caller shapes to
// support: (a) server-to-server, from ai-intake-chat/voice-intake-agent,
// authenticated with the real service-role key; (b) real end-user
// sessions, from TechnicianView.jsx (job.completed) and
// DispatcherView.jsx (invoice.paid) — owner OR any technician of that
// business, so `isOwnerOrTechnicianOfBusiness` (not the job-scoped
// variant, since there's no single "assigned" technician here).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { matchesCondition, daysOverdue } from "./logic.ts"
import { isOwnerOrTechnicianOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

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
      // Internal service-to-service calls (ai-intake-chat, voice-intake-agent)
      // present the real service-role key — trusted outright, same rule as
      // notify-slack. Anything else must prove owner-or-technician identity.
      const authHeader = req.headers.get('Authorization') || ''
      const isInternalCall = authHeader.replace(/^Bearer\s+/i, '') === supabaseServiceKey
      if (!isInternalCall) {
        const caller = await getAuthenticatedCaller(req, supabase)
        if (!caller) {
          return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          })
        }
        const { data: business } = await supabase
          .from('businesses')
          .select('owner_user_id, contact_email')
          .eq('id', businessId)
          .maybeSingle()
        const { data: roster } = await supabase
          .from('technicians')
          .select('auth_user_id')
          .eq('business_id', businessId)
        if (!isOwnerOrTechnicianOfBusiness(business, roster, caller.id, caller.email)) {
          return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
            status: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          })
        }
      }

      const result = await runWorkflowsFor(supabase, supabaseUrl, supabaseServiceKey, businessId, event, payload)
      supabase.rpc('record_agent_run', { fn_name: 'run-custom-workflows', status: 'ok' }).then(() => {}, () => {})
      return new Response(JSON.stringify({ success: true, ...result }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Cron sweep with no body: find every business with at least one active
    // 'invoice.overdue' workflow, then check just their invoices (not every
    // business's) for anything unpaid and 3+ days old that hasn't already
    // been claimed for this trigger — see header comment for the full
    // rationale and the atomic-claim ordering.
    const OVERDUE_THRESHOLD_DAYS = 3
    const nowIso = new Date().toISOString()
    const cutoffIso = new Date(Date.now() - OVERDUE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data: overdueWorkflows } = await supabase
      .from('custom_workflows')
      .select('business_id')
      .eq('trigger_event', 'invoice.overdue')
      .eq('active', true)
    const businessIds: string[] = [...new Set((overdueWorkflows || []).map((w: any) => w.business_id))]

    let totalRan = 0
    let totalChecked = 0
    for (const bId of businessIds) {
      const { data: overdueInvoices } = await supabase
        .from('invoices')
        .select('id, client_name, total, created_at')
        .eq('business_id', bId)
        .eq('status', 'unpaid')
        .lt('created_at', cutoffIso)
        .is('workflow_overdue_notified_at', null)

      for (const inv of overdueInvoices || []) {
        totalChecked++
        // Atomic claim: only the sweep that actually flips this row from
        // null gets to run the workflow, so an overlapping run racing on
        // the same invoice is a harmless no-op for it, not a double-fire.
        const { data: claimed } = await supabase
          .from('invoices')
          .update({ workflow_overdue_notified_at: nowIso })
          .eq('id', inv.id)
          .is('workflow_overdue_notified_at', null)
          .select('id')
        if (!claimed || claimed.length === 0) continue

        const result = await runWorkflowsFor(supabase, supabaseUrl, supabaseServiceKey, bId, 'invoice.overdue', {
          invoice_id: inv.id,
          client_name: inv.client_name,
          total: inv.total,
          days_overdue: daysOverdue(inv.created_at, nowIso),
        })
        totalRan += result.ran
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'run-custom-workflows', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({
      success: true,
      note: businessIds.length ? `checked ${totalChecked} overdue invoice(s) across ${businessIds.length} business(es)` : 'no time-based triggers configured',
      ran: totalRan,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('run-custom-workflows error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
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
  supabaseServiceKey: string,
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
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
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

async function logRun(supabase: any, workflowId: string, businessId: string, event: string, status: string, detail: string) {
  await supabase.from('workflow_runs').insert({
    workflow_id: workflowId,
    business_id: businessId,
    trigger_event: event,
    status,
    detail,
  }).catch(() => {})
}
