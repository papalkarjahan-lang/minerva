// Supabase Edge Function: send-job-rescheduled-sms
// Direct invocation: { jobId, previousScheduledTime? }
// Fires automatically whenever a dispatcher reschedules a job
// (DispatcherView's rescheduleJob) — the first reschedule path this app
// has ever had. Texts the client and (if one was assigned) the technician.
// previousScheduledTime is optional and, when supplied, lets the message
// honestly say "moved from X to Y" instead of only stating the new time —
// older/internal callers that omit it still get a "rescheduled to Y" text.
// Deploy with: supabase functions deploy send-job-rescheduled-sms
//
// Same ownership-check pattern as send-job-cancelled-sms/send-job-assignment-sms.
// Claim is scoped to `rescheduled_sms_sent_for` (the scheduled_time this
// notification was already sent for) rather than a plain null-check — a
// job can legitimately be rescheduled more than once, and each new time
// deserves its own text, same shape as technician_notified_for.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone, buildJobRescheduledMessage, buildJobRescheduledTechMessage } from "../_shared/sms.ts"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-job-rescheduled-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { jobId, previousScheduledTime } = await req.json()
    if (!jobId) throw new Error('jobId is required')

    const { data: job, error: jobErr } = await supabase.from('jobs')
      .select('id, client_name, client_phone, client_address, scheduled_time, technician_id, rescheduled_sms_sent_for, businesses(name, owner_user_id, contact_email)')
      .eq('id', jobId).maybeSingle()
    if (jobErr || !job) throw new Error('job not found')
    if (!job.scheduled_time) throw new Error('job has no scheduled_time to notify about')

    const jobBusiness = (job as any).businesses

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
      if (!isOwnerOfBusiness(jobBusiness, caller.id, caller.email)) {
        return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
    }

    // Atomically claim a reminder for THIS scheduled_time before sending —
    // see header comment. Scoped so a genuine later reschedule to a
    // DIFFERENT time still gets through.
    const { data: claimed, error: claimErr } = await supabase
      .from('jobs')
      .update({ rescheduled_sms_sent_for: job.scheduled_time })
      .eq('id', jobId)
      .or(`rescheduled_sms_sent_for.is.null,rescheduled_sms_sent_for.neq.${job.scheduled_time}`)
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ success: true, alreadyNotified: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      await supabase.from('jobs').update({ rescheduled_sms_sent_for: null }).eq('id', jobId).then(() => {}, () => {})
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    const bizName = jobBusiness?.name || 'your dispatcher'
    const fmt = (iso: string) => new Date(iso).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })
    const when = fmt(job.scheduled_time)
    // previousScheduledTime is optional (older/internal callers may omit it) — when present,
    // it lets the message honestly say "moved from X to Y" instead of only the new time.
    const previousWhen = previousScheduledTime ? fmt(previousScheduledTime) : null

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

    if (job.client_phone) {
      try {
        await sendSms(formatAuPhone(job.client_phone), buildJobRescheduledMessage({ clientName: job.client_name, businessName: bizName, when, previousWhen }))
        results.client = 'sent'
      } catch (err) {
        console.error('send-job-rescheduled-sms: client send failed', err)
        results.client = 'failed'
      }
    } else {
      results.client = 'no_phone'
    }

    if (job.technician_id) {
      const { data: tech } = await supabase.from('technicians').select('phone, name').eq('id', job.technician_id).maybeSingle()
      if (tech?.phone) {
        try {
          await sendSms(formatAuPhone(tech.phone), buildJobRescheduledTechMessage({ techName: tech.name, clientAddress: job.client_address, when, previousWhen }))
          results.technician = 'sent'
        } catch (err) {
          console.error('send-job-rescheduled-sms: technician send failed', err)
          results.technician = 'failed'
        }
      } else {
        results.technician = 'no_phone'
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-job-rescheduled-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-job-rescheduled-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-job-rescheduled-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
