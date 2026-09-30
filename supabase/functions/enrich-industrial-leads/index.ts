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
//
// Ownership check added 2026-09-27: the direct-invocation path took a bare
// leadId and wrote attacker-controlled decision_maker_name/title/contact
// onto it (plus flipping status to 'enriched') with zero identity check —
// same forged-request shape as every other gap fixed this round, but this
// one has no live frontend caller today (confirmed by grep of src/ — this
// mode is dead code until a real vendor/manual-entry UI is wired up), so
// the "unauthenticated request racing the atomic claim" framing used for
// send-growth-message/launch-ad-campaign doesn't apply here. What does
// apply: this function is reachable right now at a public URL with just
// the anon key, and industrial_leads is in the exact same
// "guessable-in-principle UUID, real write, no session possible yet" shape
// as harvest-industrial-leads (its own sibling in this same domain,
// already gated on X-Ingestion-Key) — so any caller who obtained/guessed
// another business's leadId could pollute their lead pipeline with fake
// contact info before that business ever sources real enrichment data.
// Fixed the same way as harvest-industrial-leads: requires the caller to
// present the target business's own X-Ingestion-Key (set alongside the
// business's other ingestion credentials), not a Supabase Auth session —
// there's no dispatcher UI for this path yet, so an owner-auth check would
// have nothing real to authenticate against.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingestion-key' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'enrich-industrial-leads').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (body.leadId) {
        const { data: lead, error: leadErr } = await supabase
          .from('industrial_leads')
          .select('id, business_id, businesses(ingestion_key)')
          .eq('id', body.leadId)
          .maybeSingle()
        if (leadErr || !lead) {
          return new Response(JSON.stringify({ success: false, error: 'lead not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          })
        }

        const providedKey = req.headers.get('x-ingestion-key')
        const expectedKey = (lead as any).businesses?.ingestion_key
        if (!providedKey || providedKey !== expectedKey) {
          return new Response(JSON.stringify({ error: 'missing or invalid X-Ingestion-Key header' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          })
        }

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

      // Atomically claim these leads BEFORE Slacking, not after — same
      // claim-before-notify pattern used across this codebase's other
      // alerting agents (e.g. verify-industrial-compliance). The previous
      // order (Slack first, flag second) left a TOCTOU window where an
      // overlapping/duplicate daily cron run could re-select the same
      // still-unflagged leads and send a second Slack nudge for the same
      // batch. Re-selecting with .is('enrichment_nudge_sent_at', null) in
      // the WHERE clause (not just the initial SELECT) means a concurrent
      // run's claim already flipped the flag, so this update affects 0 of
      // those rows and they're excluded from the notification text below.
      const { data: claimed } = await supabase.from('industrial_leads')
        .update({ enrichment_nudge_sent_at: new Date().toISOString() })
        .in('id', unenriched.map((l: any) => l.id))
        .is('enrichment_nudge_sent_at', null)
        .select('id, company_name')
      if (!claimed || claimed.length === 0) continue

      const names = claimed.slice(0, 3).map((l: any) => l.company_name).join(', ')
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ businessId: biz.id, text: `📇 *Enrich*: ${claimed.length} lead(s) still missing a decision-maker contact — ${names}${claimed.length > 3 ? ', ...' : ''}.` }),
      }).catch(() => {})
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
      const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      supabase.rpc('record_agent_run', { fn_name: 'enrich-industrial-leads', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* best-effort only */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
