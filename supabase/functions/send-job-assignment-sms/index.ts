// Supabase Edge Function: send-job-assignment-sms
// Direct invocation: { jobId, technicianId, previousTechnicianId? }
// Fires automatically whenever a dispatcher (DispatcherView's assignJob) or
// auto-assign-technician assigns a job to a technician — this is an
// operational/logistics notification (same category as send-eta-sms /
// send-completion-sms), not a Sales & Marketing message, so unlike the
// Growth pillar it does NOT need a separate human-approval click each send;
// the dispatcher's own "assign" action (or the auto-assign agent's own
// existing approval boundary) IS the approval.
//
// Texts the newly-assigned technician the job's client name/address/time.
// If previousTechnicianId is supplied (a reassignment, not a fresh
// assignment), also texts that technician letting them know the job was
// taken off their plate — so nobody drives to a job that's no longer theirs.
// Both sends are best-effort/fire-and-forget from the caller's perspective —
// a failed SMS here should never block the job-assignment write itself.
// Deploy with: supabase functions deploy send-job-assignment-sms
//
// Kill-switch/health wiring added 2026-09-23: this was never registered in
// agent_functions at all, despite being the same operational-SMS category
// as send-eta-sms/send-completion-sms (both already registered/gated) —
// found via a directory-vs-agent_functions diff. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.
//
// Ownership check added 2026-09-24 (Round 43): had verify_jwt:false and no
// check that the caller has any relationship to the business that owns
// jobId — meaning an unauthenticated stranger who knew/guessed a jobId
// could force-send a real assignment SMS to that job's technicians. Fixed
// using the same isOwner pattern xero-oauth-connect already used for the
// identical forged-request risk.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone, buildJobAssignmentMessage, buildJobReassignmentMessage } from "../_shared/sms.ts"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-job-assignment-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { jobId, technicianId, previousTechnicianId } = await req.json()
    if (!jobId || !technicianId) throw new Error('jobId and technicianId are required')

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    const { data: job, error: jobErr } = await supabase.from('jobs')
      .select('id, client_name, client_address, scheduled_time, urgency, businesses(name, owner_user_id, contact_email)')
      .eq('id', jobId).maybeSingle()
    if (jobErr || !job) throw new Error('job not found')

    const jobBusiness = (job as any).businesses

    // Ownership check — see header note. A legitimate dispatcher's session
    // JWT is already attached automatically by supabase.functions.invoke(),
    // so this adds no friction for real usage.
    const caller = await getAuthenticatedCaller(req, supabase)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!isOwnerOfBusiness(jobBusiness, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const bizName = jobBusiness?.name || 'your dispatcher'
    const when = job.scheduled_time
      ? new Date(job.scheduled_time).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })
      : 'ASAP'
    async function sendSms(to: string, body: string) {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: TWILIO_FROM!, Body: body }).toString(),
      })
      const result = await res.json().catch(() => ({}))
      if (result.error_code) throw new Error(`Twilio rejected the send: ${result.error_message || result.error_code}`)
    }

    const results: Record<string, string> = {}

    const { data: newTech } = await supabase.from('technicians').select('phone, name').eq('id', technicianId).maybeSingle()
    if (newTech?.phone) {
      try {
        await sendSms(formatAuPhone(newTech.phone),
          buildJobAssignmentMessage({ techName: newTech.name, businessName: bizName, clientName: job.client_name, clientAddress: job.client_address, when, isEmergency: job.urgency === 'emergency' }))
        results.newTechnician = 'sent'
      } catch (err) {
        console.error('send-job-assignment-sms: new technician send failed', err)
        results.newTechnician = 'failed'
      }
    } else {
      results.newTechnician = 'no_phone'
    }

    if (previousTechnicianId && previousTechnicianId !== technicianId) {
      const { data: prevTech } = await supabase.from('technicians').select('phone, name').eq('id', previousTechnicianId).maybeSingle()
      if (prevTech?.phone) {
        try {
          await sendSms(formatAuPhone(prevTech.phone),
            buildJobReassignmentMessage({ techName: prevTech.name, clientAddress: job.client_address }))
          results.previousTechnician = 'sent'
        } catch (err) {
          console.error('send-job-assignment-sms: previous technician send failed', err)
          results.previousTechnician = 'failed'
        }
      } else {
        results.previousTechnician = 'no_phone'
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-job-assignment-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-job-assignment-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-job-assignment-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
