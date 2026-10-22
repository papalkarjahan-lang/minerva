// Supabase Edge Function: send-appointment-reminder-sms
// Autonomous agent, run daily via pg_cron (see supabase_schema_delta_
// appointment_reminder_cron.sql). Finds jobs scheduled for tomorrow (the
// business's local Australia/Sydney calendar day, same "tomorrow" window
// check-weather-risk uses and for the same reason — see that function's
// logic.ts header on why a naive UTC+1 window silently shortens the lead
// time) with a client phone on file, and sends a one-time reminder SMS.
// Low-stakes informational nudge, same tier as the completion/ETA texts —
// no human-approval gate needed (see send-referral-code-sms's header for
// why that gate exists for some functions and not others).
//
// Why this exists (2026-10-23): "invoice reminders" was marketed as one of
// Standard's 6 real automations (see BILLING_INTEGRITY_NOTES.md's
// "Standard tier had no real differentiator from Starter" entry), but
// on-site invoicing is Pro-exclusive (TechnicianView.jsx only shows the
// invoice builder for subscription_tier === 'pro') — a Standard business
// never has an invoices row to chase, so chase-unpaid-invoices could never
// fire for the tier it was sold to. Same root bug as the referral-code gap
// fixed earlier this session, just caught on the tier axis instead of the
// sector axis. This replaces that marketing slot with a feature actually
// reachable from the `jobs` table every tier has.
//
// Deploy with: supabase functions deploy send-appointment-reminder-sms
// Required secrets: same Twilio secrets as the other SMS functions.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { addLocalDays, localMidnightUTC } from "./logic.ts"
import { sendTwilioSms } from "../_shared/twilioSms.ts"
import { buildAppointmentReminderMessage } from "../_shared/sms.ts"
import { chunk } from "../_shared/batch.ts"
import { hasStandardAutomation } from "../_shared/tierEligibility.ts"

const BUSINESS_TIMEZONE = 'Australia/Sydney'
const JOB_BATCH_SIZE = 20

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-appointment-reminder-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const twilio = {
      sid: Deno.env.get('TWILIO_ACCOUNT_SID'),
      token: Deno.env.get('TWILIO_AUTH_TOKEN'),
      from: Deno.env.get('TWILIO_PHONE_NUMBER'),
    }

    const todayLocalYMD = new Intl.DateTimeFormat('en-CA', { timeZone: BUSINESS_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const tomorrowDateStr = addLocalDays(todayLocalYMD, 1)
    const tomorrowStart = localMidnightUTC(tomorrowDateStr, BUSINESS_TIMEZONE)
    const tomorrowEnd = localMidnightUTC(addLocalDays(tomorrowDateStr, 1), BUSINESS_TIMEZONE)

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, business_id, client_name, client_phone, client_address, scheduled_time, appointment_reminder_sent, businesses(name, subscription_tier, sector)')
      .eq('status', 'scheduled')
      .not('client_phone', 'is', null)
      .is('appointment_reminder_sent', false)
      .gte('scheduled_time', tomorrowStart.toISOString())
      .lt('scheduled_time', tomorrowEnd.toISOString())
    if (error) throw error

    // Standard-tier automation gate (added 2026-10-23) — see
    // _shared/tierEligibility.ts's hasStandardAutomation header and
    // BILLING_INTEGRITY_NOTES.md's follow-up entry. Same gate as the other
    // 5 Standard automations this function joins.
    const eligible = (jobs || []).filter(job => hasStandardAutomation((job as any).businesses?.subscription_tier, (job as any).businesses?.sector))

    let sent = 0
    // Bounded-concurrency batching — same chunk()-of-20 shape as every
    // other platform-wide cron sweep in this codebase, see
    // SCALE_READINESS_NOTES_ROUND2.md.
    for (const batch of chunk(eligible, JOB_BATCH_SIZE)) {
      const results = await Promise.all(batch.map(job => processOneJob(supabase, supabaseUrl, supabaseServiceKey, twilio, job)))
      for (const didSend of results) if (didSend) sent++
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-appointment-reminder-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, scanned: eligible.length, sent }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-appointment-reminder-sms error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      createClient(supabaseUrl, supabaseServiceKey)
        .rpc('record_agent_run', { fn_name: 'send-appointment-reminder-sms', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Extracted so it can run through chunk()'s bounded-concurrency batching.
// Returns whether a reminder was actually sent.
async function processOneJob(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string,
  twilio: { sid: string | undefined; token: string | undefined; from: string | undefined },
  job: any
): Promise<boolean> {
  // Atomically claim this job before sending — same claim-before-send
  // pattern as chase-unpaid-invoices/send-completion-sms, so an
  // overlapping/duplicate invocation can't text the same client twice.
  // Re-checks status='scheduled' too, not just the flag, so a job
  // cancelled or rescheduled in the moments between the SELECT above and
  // this UPDATE doesn't still get a reminder for a job that's no longer
  // actually happening as scheduled.
  const { data: claimed, error: claimErr } = await supabase
    .from('jobs')
    .update({ appointment_reminder_sent: true })
    .eq('id', job.id)
    .eq('status', 'scheduled')
    .is('appointment_reminder_sent', false)
    .select('id')
  if (claimErr) { console.error('send-appointment-reminder-sms: claim failed:', claimErr.message); return false }
  if (!claimed || claimed.length === 0) return false // already claimed, or no longer scheduled

  const bizName = job.businesses?.name || 'us'
  const when = new Date(job.scheduled_time).toLocaleString('en-AU', {
    timeZone: BUSINESS_TIMEZONE, weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short',
  })
  const message = buildAppointmentReminderMessage({
    clientName: job.client_name,
    businessName: bizName,
    clientAddress: job.client_address,
    when,
  })

  const smsOk = await sendTwilioSms(twilio, job.client_phone, message, 'send-appointment-reminder-sms')

  // A transient Twilio error (or Twilio being unconfigured) reverts the
  // claim rather than leaving this job permanently marked as reminded —
  // same reasoning as chase-unpaid-invoices, though in practice a later
  // retry only helps if it still runs before the job's scheduled time.
  if (!smsOk) {
    await supabase.from('jobs').update({ appointment_reminder_sent: false }).eq('id', job.id)
  }

  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
    body: JSON.stringify({
      businessId: job.business_id,
      text: smsOk
        ? `📅 Appointment reminder sent to *${job.client_name || 'client'}* for tomorrow's job.`
        : `⚠️ Appointment reminder for *${job.client_name || 'client'}*'s tomorrow job failed to send. Check the number on file.`,
    }),
  }).catch(() => {})

  return smsOk
}
