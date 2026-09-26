// Supabase Edge Function: send-email
// Generic transactional email sender used by other functions (currently:
// stripe-webhook's welcome email on checkout.session.completed). Gated on
// an optional RESEND_API_KEY secret — if it isn't set, this returns a
// clearly-labelled skipped:true response instead of throwing, so callers
// that fire-and-forget this function (like stripe-webhook) never fail a
// real business event just because email isn't configured yet.
//
// Deploy with: supabase functions deploy send-email
//
// Optional secret: RESEND_API_KEY (get one at https://resend.com — free
// tier is enough for transactional volume at this scale). Until it's set,
// every call is a documented no-op.
// Optional secret: RESEND_FROM_EMAIL (defaults to Resend's shared onboarding
// address, which only works for testing — set a verified sending domain
// address here before relying on this in production).
//
// Kill-switch/health wiring added 2026-09-23: this is the shared choke
// point for every transactional/outreach email in the codebase (stripe-
// webhook's welcome email, send-outreach-batch's prospecting emails, etc.)
// yet was never registered in agent_functions at all — found via a
// directory-vs-agent_functions diff. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.
//
// Internal-only caller-identity fix (2026-09-27): this function had
// verify_jwt:true but NO application-level caller check, and this codebase
// already established (see SECURITY_NOTES.md) that verify_jwt is NOT a
// real security boundary — the public anon key is itself a valid signed
// JWT, so verify_jwt:true only blocks a request with no Authorization
// header at all, not one bearing the anon key. Confirmed live: a POST with
// only the anon key reaches this function's own code (hits the
// to/subject/html validation below) rather than being rejected at the
// platform layer. Every real caller of this function (stripe-webhook,
// test-agent-health, send-outreach-batch) is itself a server-side edge
// function invoking this one with its own SUPABASE_SERVICE_ROLE_KEY as the
// Authorization bearer — none of them are reachable from the frontend, and
// this function was never meant to be either. Left unfixed, this was an
// open relay: once RESEND_API_KEY is configured (now live), anyone holding
// the public anon key (shipped in every page load) could send an arbitrary
// email — attacker-chosen recipient, subject, and HTML — through Minerva's
// own paid Resend account and sending domain. Real risk: phishing using
// Minerva's domain, spam/abuse reports against that domain hurting
// deliverability for every legitimate email this codebase sends, and
// Resend quota exhaustion. Fixed by requiring the caller's own
// Authorization header to literally be the service role key, matching how
// every real caller already invokes this function — no change for any
// legitimate usage.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const callerToken = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (callerToken !== supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-email').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { to, subject, html } = await req.json()
    if (!to || !subject || !html) {
      return new Response(JSON.stringify({ error: 'to, subject, and html are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      console.warn('send-email: RESEND_API_KEY not configured — skipping send to', to)
      return new Response(JSON.stringify({ success: false, skipped: true, reason: 'RESEND_API_KEY not configured' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const from = Deno.env.get('RESEND_FROM_EMAIL') || 'Minerva <onboarding@resend.dev>'

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    })

    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(result?.message || `Resend API error (${res.status})`)
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-email', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-email error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-email', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
