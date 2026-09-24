// Supabase Edge Function: send-completion-sms
// Triggered when a technician marks a job complete (handleCompleteJob in
// TechnicianView.jsx). Sends the client a short "job's done" SMS.
// Deploy with: supabase functions deploy send-completion-sms
//
// Required Supabase secrets (set via Dashboard > Edge Functions > Secrets):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER  (your Twilio AU number, format: +61412345678)
//
// Health/kill-switch wiring added 2026-09-23: this was registered in
// agent_functions (seeded in supabase_schema_delta_agent_infra.sql) but
// never actually checked `enabled` or called `record_agent_run` — a
// failed send to a real client was 100% invisible everywhere, same bug
// class as the sync-technician-billing/followup-outreach fix from
// 2026-09-22 (see supabase_schema_delta_operational_fixes.sql /
// supabase_schema_delta_followup_outreach_agent_registration.sql).
//
// Redesigned 2026-09-24 (Round 43): same open-SMS-relay risk and fix as
// send-eta-sms (see that function's header for the full reasoning) — took
// clientPhone/clientName/techName/businessName directly with no
// caller-identity check and no database lookup, so any caller with just the
// anon key could blast arbitrary text to an arbitrary number via Minerva's
// shared Twilio number. Now takes only `jobId`; the SMS content is built
// from the job/business/technician rows, and the caller must be the
// business owner OR the technician assigned to that job
// (isOwnerOrAssignedTechnician). The old `completedAt` field was accepted
// but never actually used in the message — dropped, not replaced.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone, buildCompletionMessage } from "../_shared/sms.ts"
import { isOwnerOrAssignedTechnician, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-completion-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { jobId } = await req.json()
    if (!jobId) throw new Error('jobId is required')

    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, client_name, client_phone, business_id, technician_id, businesses(name, owner_user_id, contact_email), technicians!jobs_technician_id_fkey(id, name, auth_user_id)')
      .eq('id', jobId)
      .maybeSingle()
    if (jobErr || !job) throw new Error('Job not found')

    // Ownership check — see header note. A legitimate technician's or
    // dispatcher's session JWT is already attached automatically by
    // supabase.functions.invoke(), so this adds no friction for real usage.
    const caller = await getAuthenticatedCaller(req, supabase)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!isOwnerOrAssignedTechnician((job as any).businesses, (job as any).technicians, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this job.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!job.client_phone) {
      return new Response(JSON.stringify({ error: 'This job has no client phone number on file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const techName = (job as any).technicians?.name || 'your technician'
    const businessName = (job as any).businesses?.name || 'us'

    const phone = formatAuPhone(job.client_phone)
    const message = buildCompletionMessage({ clientName: job.client_name, techName, businessName })

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')

    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: phone,
          From: TWILIO_FROM,
          Body: message,
        }).toString(),
      }
    )

    const result = await response.json()

    if (result.error_code) {
      throw new Error(`Twilio error ${result.error_code}: ${result.message}`)
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-completion-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, sid: result.sid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (err) {
    console.error('send-completion-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-completion-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
