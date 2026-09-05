// Supabase Edge Function: enrich-industrial-leads
// "Enrich" — the other half of the Lead Gathering & Intent domain.
//
// HONESTY NOTE: scraping LinkedIn or similar platforms for decision-maker
// contact data would violate those platforms' terms of service and isn't
// something this build does. This function's real job is twofold:
//  1. Direct invocation { leadId, decision_maker_name, decision_maker_title,
//     decision_maker_contact } — accepts enrichment data from wherever a
//     business actually sources it legitimately (their own CRM export, a
//     licensed data provider's API once they have one, or manual research)
//     and writes it onto the lead, marking status='enriched'.
//  2. Cron sweep (no body, daily) — finds industrial_leads still sitting at
//     status='new' with no decision-maker contact, and nudges Slack so a
//     human knows enrichment is the blocking step, rather than the lead
//     silently going nowhere. Each lead is only nudged once
//     (enrichment_nudge_sent_at, see supabase_schema_delta_enrichment_nudge.sql)
//     so a lead stuck at 'new' doesn't get re-Slacked every day forever.
// Deploy with: supabase functions deploy enrich-industrial-leads

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

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (body.leadId) {
        const { data: updated, error: updateErr } = await supabase.from('industrial_leads').update({
          decision_maker_name: body.decision_maker_name || null,
          decision_maker_title: body.decision_maker_title || null,
          decision_maker_contact: body.decision_maker_contact || null,
          status: 'enriched',
        }).eq('id', body.leadId).select().maybeSingle()

        if (updateErr || !updated) {
          return new Response(JSON.stringify({ success: false, error: updateErr?.message || 'lead not found' }), {
            status: updateErr ? 500 : 404,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          })
        }

        supabase.rpc('record_agent_run', { fn_name: 'enrich-industrial-leads', status: 'ok' }).then(() => {}, () => {})
        return new Response(JSON.stringify({ success: true, enriched: body.leadId }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
    }

    // Cron sweep: nudge on leads still blocked on enrichment.
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: businesses } = await supabase.from('businesses').select('id, name').eq('sector', 'industrial')

    let nudged = 0
    for (const biz of businesses || []) {
      // Only nudge leads that haven't already been nudged once — without
      // this filter, a lead stuck at status='new' gets re-Slacked every
      // single day forever. Once nudged, it's silent until a human either
      // enriches it (status changes away from 'new') or looks into it.
      const { data: unenriched } = await supabase.from('industrial_leads')
        .select('id, company_name')
        .eq('business_id', biz.id)
        .eq('status', 'new')
        .is('decision_maker_contact', null)
        .is('enrichment_nudge_sent_at', null)
        .lt('created_at', dayAgo)

      if (!unenriched || unenriched.length === 0) continue
      const names = unenriched.slice(0, 3).map((l: any) => l.company_name).join(', ')
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: biz.id, text: `📇 *Enrich*: ${unenriched.length} lead(s) still missing a decision-maker contact — ${names}${unenriched.length > 3 ? ', ...' : ''}.` }),
      }).catch(() => {})
      await supabase.from('industrial_leads')
        .update({ enrichment_nudge_sent_at: new Date().toISOString() })
        .in('id', unenriched.map((l: any) => l.id))
      nudged++
    }

    supabase.rpc('record_agent_run', { fn_name: 'enrich-industrial-leads', status: 'ok' }).then(() => {}, () => {})
    return new Response(JSON.stringify({ success: true, businessesNudged: nudged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('enrich-industrial-leads error:', err)
    try {
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'enrich-industrial-leads', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
