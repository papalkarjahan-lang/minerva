// Supabase Edge Function: send-eta-sms
// Triggered when a technician comes within 2km of the client address.
// Deploy with: supabase functions deploy send-eta-sms
//
// Required Supabase secrets (set via Dashboard > Edge Functions > Secrets):
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_PHONE_NUMBER  (your Twilio AU number, format: +61412345678)
//   APP_URL              (same var used by create-checkout-session; builds
//                         the tracking link server-side, see below)
//
// Health/kill-switch wiring added 2026-09-23: this was registered in
// agent_functions (seeded in supabase_schema_delta_agent_infra.sql) but
// never actually checked `enabled` or called `record_agent_run` — a
// failed send to a real client was 100% invisible everywhere, same bug
// class as the sync-technician-billing/followup-outreach fix from
// 2026-09-22.
//
// Redesigned 2026-09-24 (Round 43): originally took clientPhone/clientName/
// techName/businessName/trackingUrl directly in the request body with no
// caller-identity check and no database lookup at all — meaning ANY caller
// (the anon key alone is enough, verify_jwt is false here) could make this
// function blast arbitrary text to an arbitrary AU phone number "from"
// Minerva's own shared Twilio number (TWILIO_PHONE_NUMBER is one
// platform-wide secret, not a per-business number), at zero cost/friction —
// an open-SMS-relay risk distinct from (and worse than) the forged-request-
// against-a-known-record gap fixed elsewhere this round. Now takes only a
// `jobId`; every field that goes into the SMS is read from the job/business/
// technician rows instead of trusted from the request body, and the caller
// must be the business owner OR the specific technician assigned to that
// job (isOwnerOrAssignedTechnician — technician-login gives technicians a
// real Supabase Auth JWT linked via technicians.auth_user_id, so this isn't
// owner-only). No frontend change to worry about breaking real usage:
// TechnicianView.jsx's own session token is already attached automatically
// by supabase.functions.invoke().

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone, buildEtaMessage } from "../_shared/sms.ts"
import { isOwnerOrAssignedTechnician, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-eta-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { jobId } = await req.json()
    if (!jobId) throw new Error('jobId is required')

    const APP_URL = Deno.env.get('APP_URL')
    if (!APP_URL) throw new Error('APP_URL not configured in Supabase secrets')

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
    const trackingUrl = `${APP_URL}/track/${job.id}`

    const phone = formatAuPhone(job.client_phone)
    const message = buildEtaMessage({ clientName: job.client_name, businessName, techName, trackingUrl })

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

    supabase.rpc('record_agent_run', { fn_name: 'send-eta-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, sid: result.sid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })

  } catch (err) {
    console.error('send-eta-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-eta-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
