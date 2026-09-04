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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { jobId, technicianId, previousTechnicianId } = await req.json()
    if (!jobId || !technicianId) throw new Error('jobId and technicianId are required')

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    const { data: job, error: jobErr } = await supabase.from('jobs')
      .select('id, client_name, client_address, scheduled_time, urgency, businesses(name)')
      .eq('id', jobId).maybeSingle()
    if (jobErr || !job) throw new Error('job not found')

    const bizName = (job as any).businesses?.name || 'your dispatcher'
    const when = job.scheduled_time
      ? new Date(job.scheduled_time).toLocaleString('en-AU', { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })
      : 'ASAP'
    const urgencyTag = job.urgency === 'emergency' ? ' [EMERGENCY]' : ''

    function formatPhone(raw: string) {
      let p = raw.replace(/\s/g, '')
      if (p.startsWith('0')) p = '+61' + p.slice(1)
      if (!p.startsWith('+')) p = '+61' + p
      return p
    }

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
        await sendSms(formatPhone(newTech.phone),
          `Hi ${newTech.name || ''}, new job assigned${urgencyTag} from ${bizName}: ${job.client_name || 'Client'} at ${job.client_address || 'address on file'}, ${when}. Open Minerva to view details.`.trim())
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
          await sendSms(formatPhone(prevTech.phone),
            `Hi ${prevTech.name || ''}, your job at ${job.client_address || 'the scheduled address'} has been reassigned to someone else. If you're already on the way, contact your dispatcher.`)
          results.previousTechnician = 'sent'
        } catch (err) {
          console.error('send-job-assignment-sms: previous technician send failed', err)
          results.previousTechnician = 'failed'
        }
      } else {
        results.previousTechnician = 'no_phone'
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-job-assignment-sms error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
