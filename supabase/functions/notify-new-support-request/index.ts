// Supabase Edge Function: notify-new-support-request
// Public, called directly from ContactSupportModal.jsx right after a
// support_requests row is inserted (same pattern as track-review-click —
// browser hits a public edge function, the function holds the real
// OPERATOR_EMAIL secret the browser never sees).
//
// WHY: support_requests has existed since 2026-09-05
// (supabase_schema_delta_support_requests.sql) and AdminConsole.jsx has
// always been able to read/triage it, but nothing has EVER notified
// anyone that a new one arrived — found while tracing classifyPriority()'s
// call site (ContactSupportModal.jsx) and realizing the priority it
// computes (urgent vs normal) has never actually reached anywhere except
// a column in a table nobody gets told to go look at. A business hitting
// "Contact support" because something is broken, or because they want to
// cancel, currently gets exactly as much response as however often the
// operator happens to remember to open the Admin console's Support tab —
// which, for a genuinely urgent message, defeats the entire point of
// classifying it as urgent in the first place.
//
// Deliberately re-reads the row server-side with the service-role key
// rather than trusting any field the browser could pass directly (name/
// contact/message/priority) — same "never trust client-claimed content,
// re-derive it" rule respond-to-quote already follows for the identical
// reason. The only thing taken from the request body is the id of a row
// that was just actually inserted through the real support_requests
// insert policy.
//
// No ownership/caller-identity check: unlike every other function this
// codebase gates that way, there is no legitimate "owner" to check against
// here — support_requests is deliberately insertable by a fully anonymous
// visitor with no business_id at all (the public /contact page). Claimed
// once via support_requests.notified_at (see
// supabase_schema_delta_support_request_notify.sql) before sending, so
// calling this twice for the same row — maliciously or by a retry — sends
// at most one email ever, same atomic-claim pattern as every other agent
// with a side effect in this codebase.
//
// Deploy with: supabase functions deploy notify-new-support-request

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { escapeHtml } from "../_shared/html.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'notify-new-support-request').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const body = await req.json().catch(() => ({}))
    const requestId: string | null = body.requestId || null
    if (!requestId) {
      return new Response(JSON.stringify({ error: 'requestId is required.' }), {
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

    const { data: reqRow } = await supabase
      .from('support_requests')
      .select('id, business_id, from_name, from_contact, message, priority, businesses(name)')
      .eq('id', requestId)
      .maybeSingle()

    if (!reqRow) {
      return new Response(JSON.stringify({ error: 'Request not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Atomically claim before sending — see header note.
    const { data: claimed, error: claimErr } = await supabase
      .from('support_requests')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', requestId)
      .is('notified_at', null)
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'already notified' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const bizName = (reqRow as any).businesses?.name
    const isUrgent = reqRow.priority === 'urgent'
    const subjectPrefix = isUrgent ? '🔴 URGENT' : 'New'
    const fromLine = [reqRow.from_name, reqRow.from_contact].filter(Boolean).join(' — ') || 'no contact details given'

    await fetch(`${supabaseUrl}/functions/v1/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        to: operatorEmail,
        subject: `[Minerva] ${subjectPrefix} support request${bizName ? ` — ${bizName}` : ''}`,
        html: `<p>${escapeHtml(fromLine)}${bizName ? ` (${escapeHtml(bizName)})` : ''} wrote:</p><p>"${escapeHtml(reqRow.message)}"</p><p>Reply from the Support tab in the Admin console.</p>`,
      }),
    }).catch(err => console.error('notify-new-support-request: send-email failed', err))

    supabase.rpc('record_agent_run', { fn_name: 'notify-new-support-request', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('notify-new-support-request error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'notify-new-support-request', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
