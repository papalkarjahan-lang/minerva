// Supabase Edge Function: notify-new-enterprise-lead
// Public, called directly from Enterprise.jsx right after a
// big_account_targets row is inserted (same "browser hits a public edge
// function holding the real secret" pattern as notify-new-support-request/
// track-review-click).
//
// WHY: big_account_targets was built as an operator-only CRM (every row
// hand-entered in AdminConsole's "Big Accounts" tab), then
// supabase_schema_delta_enterprise_inbound.sql (2026-09-14) added a
// narrowly-scoped anon INSERT policy so a real multi-van fleet, facilities-
// management company, council, or strata manager finding the public
// /enterprise page could self-identify. That delta's own header comment
// is explicit that SELECT/UPDATE stay admin-only — correct, since an
// inbound submitter must never read back the pipeline — but the practical
// consequence is that NOTHING has ever told the operator a new one
// arrived. The only other function touching this table is
// generate-roi-proposal, which reads an existing row to build a proposal;
// it doesn't fire on insert. A real inbound enterprise lead — exactly the
// highest-value prospect category this business targets, per
// BIG_ACCOUNT_EXECUTION_KIT.md — currently gets exactly as much response
// as however often the operator happens to remember to open the Big
// Accounts tab. Same bug class as the support_requests gap fixed the same
// way one round earlier, here applied to a segment worth even more per
// deal.
//
// Re-reads the row server-side with the service-role key rather than
// trusting anything the browser passes directly — same rule
// notify-new-support-request/respond-to-quote already follow — so the
// only thing taken from the request body is the id of a row that was just
// actually inserted through the real insert policy.
//
// No ownership/caller-identity check: there is no legitimate "owner" to
// check against — this table's anon INSERT policy exists specifically so
// a fully anonymous /enterprise visitor can create a row with no login at
// all. Claimed once via a new notified_at column before sending (see
// supabase_schema_delta_enterprise_lead_notify.sql), so calling this
// twice for the same row — maliciously or by a retry — sends at most one
// email ever.
//
// Deploy with: supabase functions deploy notify-new-enterprise-lead

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { escapeHtml } from "../_shared/html.ts"

const COMPANY_TYPE_LABELS: Record<string, string> = {
  multi_van: 'Multi-van trade company',
  facilities_management: 'Facilities management',
  council: 'Council / local government',
  strata: 'Strata / property management',
  other: 'Other',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'notify-new-enterprise-lead').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const body = await req.json().catch(() => ({}))
    const targetId: string | null = body.targetId || null
    if (!targetId) {
      return new Response(JSON.stringify({ error: 'targetId is required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const operatorEmail = Deno.env.get('OPERATOR_EMAIL')
    if (!operatorEmail) {
      // No-op, not an error — same "optional secret, silently skip until
      // configured" contract as send-email itself.
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'OPERATOR_EMAIL not configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: target } = await supabase
      .from('big_account_targets')
      .select('id, company_name, company_type, contact_name, contact_email, contact_phone, estimated_fleet_size, region, notes')
      .eq('id', targetId)
      .maybeSingle()

    if (!target) {
      return new Response(JSON.stringify({ error: 'Target not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Atomically claim before sending — see header note.
    const { data: claimed, error: claimErr } = await supabase
      .from('big_account_targets')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', targetId)
      .is('notified_at', null)
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'already notified' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const typeLabel = COMPANY_TYPE_LABELS[target.company_type || ''] || target.company_type || 'Unknown type'
    const contactLine = [target.contact_name, target.contact_email, target.contact_phone].filter(Boolean).join(' — ') || 'no contact details given'
    const detailLines = [
      `Type: ${typeLabel}`,
      target.estimated_fleet_size ? `Fleet size: ${target.estimated_fleet_size}` : null,
      target.region ? `Region: ${target.region}` : null,
      `Contact: ${contactLine}`,
      target.notes ? `Notes: "${target.notes}"` : null,
    ].filter(Boolean)

    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        to: operatorEmail,
        subject: `[Minerva] New enterprise lead — ${target.company_name}`,
        html: `<p>New inbound enterprise lead from the public site:</p><p><strong>${escapeHtml(target.company_name)}</strong></p><p>${detailLines.map(escapeHtml).join('<br>')}</p><p>Follow up from the Big Accounts tab in the Admin console.</p>`,
      }),
    }).catch(err => console.error('notify-new-enterprise-lead: send-email failed', err))

    supabase.rpc('record_agent_run', { fn_name: 'notify-new-enterprise-lead', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('notify-new-enterprise-lead error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'notify-new-enterprise-lead', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
