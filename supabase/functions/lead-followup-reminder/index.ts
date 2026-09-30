// Supabase Edge Function: lead-followup-reminder
// Autonomous agent, run every 15 minutes via pg_cron (see
// supabase_schema_delta_lead_followup_reminder_cron.sql).
//
// WHY: leads.next_action_at/next_action_note (supabase_schema_delta_lead_crm_pipeline.sql,
// 2026-09-14) let a dispatcher jot "call back Thursday" against a lead, but
// that delta's own comment said "nothing autonomous reads or acts on this
// field" — a dispatcher who isn't looking at the pipeline view at exactly
// the right moment silently misses their own reminder. This closes that
// gap: Slack-alert the business the moment a follow-up they scheduled for
// themselves comes due, and log it to the lead's activity timeline so it
// shows up alongside every other touch on that lead.
//
// This is a dispatcher-facing internal reminder, NOT a client-facing
// touch — no SMS/email to the client, unlike nurture-stale-leads/
// winback-lost-leads. Deploy with: supabase functions deploy lead-followup-reminder
//
// This function is called with no body (cron passes '{}') — it scans
// across ALL businesses in one run, not just one.
//
// Same claim-before-act race fix as nurture-stale-leads/chase-unpaid-invoices/
// retention-checkin: atomically claims each lead (conditional UPDATE with
// the same WHERE as the SELECT) before alerting, so an overlapping run
// can't double-alert the same reminder.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { notifySlack } from "../_shared/notifySlack.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'lead-followup-reminder').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const now = new Date().toISOString()

    const { data: dueLeads, error } = await supabase
      .from('leads')
      .select('id, business_id, client_name, next_action_at, next_action_note')
      .not('next_action_at', 'is', null)
      .lte('next_action_at', now)
      .is('next_action_reminded_at', null)

    if (error) throw error

    let alerted = 0
    for (const lead of dueLeads || []) {
      // Atomically claim this lead's reminder before alerting — see header
      // comment. A concurrent run's claim affects 0 rows and it's skipped.
      const { data: claimed, error: claimErr } = await supabase
        .from('leads')
        .update({ next_action_reminded_at: now })
        .eq('id', lead.id)
        .is('next_action_reminded_at', null)
        .select('id')
      if (claimErr) { console.error('lead-followup-reminder: claim failed:', claimErr.message); continue }
      if (!claimed || claimed.length === 0) continue // already claimed by a concurrent run

      const name = lead.client_name || 'a lead'
      const note = lead.next_action_note ? ` — "${lead.next_action_note}"` : ''
      await notifySlack(supabaseUrl, supabaseServiceKey, lead.business_id,
        `\u{1F4CC} Follow-up reminder due for *${name}*${note}`)

      await supabase.from('lead_activities').insert({
        lead_id: lead.id,
        business_id: lead.business_id,
        activity_type: 'auto_nudge',
        body: `Follow-up reminder fired${note}`,
        created_by: 'agent',
      })

      alerted++
    }

    supabase.rpc('record_agent_run', { fn_name: 'lead-followup-reminder', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({
      success: true,
      scanned: (dueLeads || []).length,
      alerted,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('lead-followup-reminder error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      createClient(supabaseUrl, supabaseServiceKey)
        .rpc('record_agent_run', { fn_name: 'lead-followup-reminder', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
