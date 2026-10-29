// Supabase Edge Function: submit-job-satisfaction
// Public, unauthenticated POST — called from TrackingView.jsx once a
// client's job shows status='complete'. Same mediating-layer pattern as
// respond-to-quote: `jobs` lost its "anon update" policy a while back
// (tightened for real security reasons — a stranger with a job's
// unguessable tracking link couldn't be allowed to write arbitrary
// fields on it), so a client-facing one-tap rating has to go through a
// function holding the real service-role key, not a direct anon update.
//
// Deploy with: supabase functions deploy submit-job-satisfaction --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isValidRating, canSubmitRating } from "./logic.ts"
import { notifySlack } from "../_shared/notifySlack.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const body = await req.json().catch(() => ({}))
    const jobId: string | null = body.jobId || null
    const rating: string | null = body.rating || null

    if (!jobId || !isValidRating(rating)) {
      return new Response(JSON.stringify({ error: 'jobId and a valid rating (good or not_great) are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: job } = await supabase
      .from('jobs')
      .select('id, business_id, status, client_satisfaction, client_name')
      .eq('id', jobId)
      .maybeSingle()

    if (!job) {
      return new Response(JSON.stringify({ error: 'This link is invalid or has expired.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!canSubmitRating(job.status, job.client_satisfaction)) {
      // Not an error for the client — most likely they already rated it,
      // or the job isn't marked complete yet. Report what's real either way.
      return new Response(JSON.stringify({ success: true, alreadySubmitted: !!job.client_satisfaction }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Atomic claim — same shape as respond-to-quote's .eq('status', ...)
    // guard, so a double-tap or retried request can't submit twice.
    const { data: claimed, error: updateError } = await supabase
      .from('jobs')
      .update({ client_satisfaction: rating, client_satisfaction_at: new Date().toISOString() })
      .eq('id', jobId)
      .is('client_satisfaction', null)
      .select('id')
    if (updateError) throw updateError
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ success: true, alreadySubmitted: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Only alert on a negative rating — a stream of "someone said 👍"
    // notifications isn't useful, but "someone wasn't happy" genuinely is,
    // same "worth interrupting someone for" bar as every other Slack alert
    // in this codebase. Fire-and-forget, never blocks the client's own
    // submission from succeeding.
    if (rating === 'not_great') {
      notifySlack(supabaseUrl, supabaseServiceKey, job.business_id, `😕 *${job.client_name || 'A client'}* rated their job "not great" — worth a follow-up call.`).catch(() => {})
    }

    supabase.rpc('record_agent_run', { fn_name: 'submit-job-satisfaction', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('submit-job-satisfaction error:', err)
    supabase.rpc('record_agent_run', { fn_name: 'submit-job-satisfaction', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
