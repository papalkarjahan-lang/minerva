// Supabase Edge Function: send-outreach-batch
// The ONLY function that ever sends Minerva's own outbound prospecting
// emails. Direct invocation only, from the admin console's "Send approved"
// button — never on a cron, never automatic. Sends ONLY to
// outreach_prospects rows already at status='approved' (a human explicitly
// reviewed the AI-drafted or hand-written content in the admin console and
// flipped it to approved) — this function will not touch 'new' or
// 'drafted' rows even if asked to, by design, so a bug elsewhere can never
// cause an unreviewed email to go out.
//
// Direct invocation: { prospectIds?: string[] } — if omitted, sends every
// row at status='approved'. Uses send-email (Resend-backed), so this is
// itself a no-op (each send skipped, logged) until RESEND_API_KEY is set —
// consistent with every other email path in this codebase.
//
// Deploy with: supabase functions deploy send-outreach-batch
//
// Kill-switch/health wiring added 2026-09-23: this was never registered in
// agent_functions at all, despite being the ONLY function that sends
// Minerva's own outbound prospecting emails — the highest-stakes Sales &
// Marketing-style send in this codebase, and yet the one function that had
// no kill switch. Found via a directory-vs-agent_functions diff. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.
//
// Fixed 2026-09-24 (Round 43 continued further still): zero caller-identity
// check of any kind — the admin console's VITE_ADMIN_EMAILS allowlist
// (AdminConsole.jsx) is documented there as an app-layer-only gate, NOT a
// security boundary, so anyone with the public anon key could invoke this
// directly and force real outbound prospecting emails to real people the
// moment RESEND_API_KEY is configured (currently a no-op only because that
// key happens to be unset — a live landmine, not a real protection). Fixed
// by requiring the caller to be a real authenticated user present in
// `admin_users` — the same table the Support tab's RLS policy already
// checks — via the new `isAdminCaller` helper in `_shared/ownership.ts`.
//
// Double-send fix (2026-09-24, Round 44 continued further still):
// same SELECT-then-send-then-mark race just fixed in the cron SMS agents
// (chase-unpaid-invoices etc.) — an admin double-clicking "Send approved",
// or two racing requests, could both SELECT the same approved prospect
// and email them twice once RESEND_API_KEY is ever configured. Now
// atomically claims each prospect (status 'approved' -> 'sending') before
// calling send-email; reverted back to 'approved' if the send fails or is
// a documented RESEND_API_KEY-unset no-op, so the "Send approved" button
// can always retry. Fixed proactively (this path is currently inert since
// RESEND_API_KEY is unset) rather than waiting for that key to be
// configured, since the fix was cheap while the pattern was fresh from
// fixing the four cron agents above.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { computeSentUpdates } from "./logic.ts"
import { isAdminCaller, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-outreach-batch').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const caller = await getAuthenticatedCaller(req, supabase)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!(await isAdminCaller(supabase, caller.id))) {
      return new Response(JSON.stringify({ error: 'You do not have access to this action.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const prospectIds: string[] | undefined = Array.isArray(body.prospectIds) ? body.prospectIds : undefined

    // Hard gate: only ever reads rows already marked 'approved' by a human,
    // and never a prospect who has asked to be unsubscribed (Spam Act 2003
    // compliance — defense-in-depth alongside the skip in draft-outreach-batch/
    // followup-outreach, in case a row was approved before being marked out).
    let query = supabase.from('outreach_prospects').select('*').eq('status', 'approved').is('unsubscribed_at', null)
    if (prospectIds) query = query.in('id', prospectIds)
    const { data: prospects, error } = await query
    if (error) throw error

    let sent = 0, skippedNoEmail = 0, failed = 0

    for (const p of prospects || []) {
      if (!p.contact_email) { skippedNoEmail++; continue }

      // Atomically claim this prospect before sending any real email —
      // the SELECT above alone is a time-of-check/time-of-use race: an
      // admin double-clicking "Send approved", or two racing admin
      // sessions/requests, could otherwise both see the same approved
      // prospect and email them twice once RESEND_API_KEY is configured.
      // Mirrors the claim-before-send fix just applied to the cron SMS
      // agents (chase-unpaid-invoices etc.) — a second request's claim
      // affects 0 rows and it skips the prospect entirely.
      const { data: claimed, error: claimErr } = await supabase
        .from('outreach_prospects')
        .update({ status: 'sending' })
        .eq('id', p.id)
        .eq('status', 'approved')
        .select('id')
      if (claimErr) { console.error('send-outreach-batch: claim failed for', p.id, claimErr.message); failed++; continue }
      if (!claimed || claimed.length === 0) continue // already claimed by a concurrent request

      try {
        const res = await fetch(`${supabaseUrl}/functions/v1/send-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceRoleKey}` },
          body: JSON.stringify({
            to: p.contact_email,
            subject: p.draft_subject || `Quick question for ${p.company_name}`,
            html: `<p>${(p.draft_body || '').split('\n').join('</p><p>')}</p>`,
          }),
        })
        const result = await res.json().catch(() => ({}))
        if (!res.ok || result?.error) throw new Error(result?.error || `send-email returned ${res.status}`)
        if (result?.skipped) {
          // RESEND_API_KEY not configured — documented no-op, not a
          // failure. Revert the claim so this prospect stays 'approved'
          // and can be sent for real once the key is set, instead of
          // being stranded in 'sending' forever.
          await supabase.from('outreach_prospects').update({ status: 'approved' }).eq('id', p.id)
          console.warn('send-outreach-batch: send-email skipped (no RESEND_API_KEY) for', p.id)
          continue
        }

        const updates = computeSentUpdates(p, new Date().toISOString())
        await supabase.from('outreach_prospects').update(updates).eq('id', p.id)
        sent++
      } catch (err) {
        // Revert the claim so a transient failure can be retried via the
        // same "Send approved" button instead of being stranded in
        // 'sending' forever with no path back to 'approved'.
        await supabase.from('outreach_prospects').update({ status: 'approved' }).eq('id', p.id)
        console.error('send-outreach-batch: send failed for', p.id, err)
        failed++
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-outreach-batch', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, sent, skippedNoEmail, failed }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-outreach-batch error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-outreach-batch', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
