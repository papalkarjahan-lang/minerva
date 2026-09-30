// Supabase Edge Function: send-job-cancelled-sms
// Direct invocation: { jobId }
// Fires automatically whenever a dispatcher cancels a job (DispatcherView's
// cancelJob) — the first cancellation path this app has ever had. Texts
// the client that their job was cancelled, and (if one was assigned) the
// technician so they don't drive out to a job that no longer exists.
// Deploy with: supabase functions deploy send-job-cancelled-sms
//
// Same ownership-check + claim-before-send pattern as send-job-assignment-sms:
// a legitimate dispatcher session is attached automatically by
// supabase.functions.invoke(), so this adds no friction for real usage —
// it only blocks a caller with no session at all from forging a
// cancellation SMS to a stranger's client using a guessed jobId.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone, buildJobCancelledMessage, buildJobCancelledTechMessage } from "../_shared/sms.ts"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-job-cancelled-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { jobId } = await req.json()
    if (!jobId) throw new Error('jobId is required')

    const { data: job, error: jobErr } = await supabase.from('jobs')
      .select('id, client_name, client_phone, client_address, technician_id, businesses(name, owner_user_id, contact_email)')
      .eq('id', jobId).maybeSingle()
    if (jobErr || !job) throw new Error('job not found')

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

    // Atomically claim this cancellation's notification before sending
    // anything — see header comment.
    const { data: claimed, error: claimErr } = await supabase
      .from('jobs')
      .update({ cancelled_sms_sent_at: new Date().toISOString() })
      .eq('id', jobId)
      .is('cancelled_sms_sent_at', null)
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
      await supabase.from('jobs').update({ cancelled_sms_sent_at: null }).eq('id', jobId).then(() => {}, () => {})
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    const bizName = jobBusiness?.name || 'your dispatcher'
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
        await sendSms(formatAuPhone(job.client_phone), buildJobCancelledMessage({ clientName: job.client_name, businessName: bizName }))
        results.client = 'sent'
      } catch (err) {
        console.error('send-job-cancelled-sms: client send failed', err)
        results.client = 'failed'
      }
    } else {
      results.client = 'no_phone'
    }

    if (job.technician_id) {
      const { data: tech } = await supabase.from('technicians').select('phone, name').eq('id', job.technician_id).maybeSingle()
      if (tech?.phone) {
        try {
          await sendSms(formatAuPhone(tech.phone), buildJobCancelledTechMessage({ techName: tech.name, clientAddress: job.client_address }))
          results.technician = 'sent'
        } catch (err) {
          console.error('send-job-cancelled-sms: technician send failed', err)
          results.technician = 'failed'
        }
      } else {
        results.technician = 'no_phone'
      }
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-job-cancelled-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-job-cancelled-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-job-cancelled-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
