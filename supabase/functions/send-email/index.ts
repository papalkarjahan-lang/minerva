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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
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

    return new Response(JSON.stringify({ success: true, id: result.id }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-email error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
