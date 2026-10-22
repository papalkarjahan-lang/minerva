// Supabase Edge Function: send-job-referral-code-sms
// Invoked from TechnicianView.jsx's finishTheJob() the moment a technician
// completes a job (same fire-and-forget pattern as triggerCompletionSMS and
// the run-custom-workflows 'job.completed' call right next to it).
//
// Why this exists (2026-10-22): the referral loop is marketed/intended for
// every paying tier, but the only existing trigger — send-referral-code-sms —
// fires exclusively from DispatcherView's markInvoicePaid handler, and
// on-site invoicing (the invoices table) is Pro-tier-exclusive. Starter and
// Standard businesses never generate an invoices row at all, so they could
// never structurally receive a referral code — a "sold vs. delivered" gap.
// This gives every tier a trigger that actually fires: job completion,
// something every tier has. See supabase_schema_delta_job_referral_code.sql.
//
// Pro tier is explicitly skipped here (shouldSkipForTier) — it already has
// a working, already-proven trigger via invoice-paid, and firing both would
// text the same client two different codes for the same job.
//
// Mirrors send-referral-code-sms's generate-once / retry-send-only idempotent
// pattern exactly, just keyed on jobs.referral_code instead of
// invoices.referral_code. Mirrors send-completion-sms's auth pattern exactly
// (isOwnerOrAssignedTechnician) since it's triggered from the same
// technician session at the same moment.
//
// Deploy with: supabase functions deploy send-job-referral-code-sms
//
// Required secrets: same Twilio secrets as the other SMS functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { sendTwilioSms } from "../_shared/twilioSms.ts"
import { generateReferralCode, shouldSkipForTier } from "./logic.ts"
import { isOwnerOrAssignedTechnician, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-job-referral-code-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { jobId } = await req.json()
    if (!jobId) throw new Error('jobId is required')

    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, business_id, client_name, client_phone, referral_code, referral_sms_failed, technician_id, businesses(name, owner_user_id, contact_email, subscription_tier), technicians!jobs_technician_id_fkey(id, name, auth_user_id)')
      .eq('id', jobId)
      .maybeSingle()
    if (error || !job) throw new Error('Job not found')

    // Ownership check — a legitimate technician's or dispatcher's session
    // JWT is already attached automatically by supabase.functions.invoke(),
    // so this adds no friction for real usage. Same pattern as
    // send-completion-sms, triggered from the same session at the same
    // moment.
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

    if (shouldSkipForTier((job as any).businesses?.subscription_tier)) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'pro tier already gets a referral code via invoice-paid' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Same "generate at most once, retry only the send" rule as
    // send-referral-code-sms — see that function's header. If a code
    // already exists and the SMS already went out, there's nothing left
    // to do; if the earlier send failed, fall through and retry sending
    // that same code.
    if (job.referral_code && !job.referral_sms_failed) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'referral code already sent' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Atomic claim — same race-condition fix as send-referral-code-sms
    // (2026-09-29): two concurrent calls (a double-tap on "Complete Job",
    // or a retried fire-and-forget) could otherwise each mint their own
    // code and overwrite each other, leaving the client's texted code
    // disagreeing with the stored one.
    let code = job.referral_code
    if (!code) {
      const candidate = generateReferralCode()
      const { data: claimed, error: claimErr } = await supabase
        .from('jobs')
        .update({ referral_code: candidate })
        .eq('id', jobId)
        .is('referral_code', null)
        .select('referral_code')
      if (claimErr) throw claimErr
      if (claimed && claimed.length > 0) {
        code = candidate
      } else {
        const { data: winner } = await supabase.from('jobs').select('referral_code').eq('id', jobId).single()
        code = winner?.referral_code || candidate
      }
    }

    if (!job.client_phone) {
      await supabase.from('jobs').update({ referral_sms_failed: true }).eq('id', jobId)
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'no client phone on file' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const bizName = (job as any).businesses?.name || 'us'
    const message = `Thanks for your business, ${job.client_name || ''}! If you know anyone who needs ${bizName}, give them your code ${code} — just mention it when they get in touch.`.trim()

    const smsOk = await sendTwilioSms(
      {
        sid: Deno.env.get('TWILIO_ACCOUNT_SID'),
        token: Deno.env.get('TWILIO_AUTH_TOKEN'),
        from: Deno.env.get('TWILIO_PHONE_NUMBER'),
      },
      job.client_phone,
      message,
      'send-job-referral-code-sms'
    )

    // Clears the flag on a successful (re)send, sets it on failure — same
    // pattern as send-referral-code-sms.
    await supabase.from('jobs').update({ referral_sms_failed: !smsOk }).eq('id', jobId)

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        businessId: job.business_id,
        text: smsOk
          ? `🤝 Referral code ${code} sent to *${job.client_name || 'client'}* after job completion.`
          : `🤝 Referral code ${code} generated for *${job.client_name || 'client'}* but the SMS didn't send (check Twilio config / phone number).`,
      }),
    }).catch(() => {})

    supabase.rpc('record_agent_run', { fn_name: 'send-job-referral-code-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, code, smsSent: smsOk }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-job-referral-code-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-job-referral-code-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
