// Supabase Edge Function: send-setup-sms
// Sent to each technician when the business owner completes onboarding
// (Onboarding.jsx, before payment — no session exists yet at that point),
// and again on-demand from DispatcherView's "Resend text"/add-technician
// flows (real dispatcher session, after payment).
// Deploy with: supabase functions deploy send-setup-sms
//
// Required Supabase secrets:
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER
//   APP_URL   (same var used by create-checkout-session; builds the
//              tech's setup link server-side, see below)
//
// Health/kill-switch wiring added 2026-09-23: this was registered in
// agent_functions (seeded in supabase_schema_delta_agent_infra.sql) but
// never actually checked `enabled` or called `record_agent_run` — a
// failed send was 100% invisible everywhere, same bug class as the
// sync-technician-billing/followup-outreach fix from 2026-09-22.
//
// Redesigned 2026-09-24 (Round 43): same open-SMS-relay concern as
// send-eta-sms/send-completion-sms/send-invoice-sms (see send-eta-sms's
// header) — took phone/name/businessName/techUrl directly with zero check,
// so any caller with just the anon key could blast arbitrary text to an
// arbitrary number via Minerva's shared Twilio number. This one is harder
// to fully close the same way, because ONE of its two real call sites
// (Onboarding.jsx, step 3 of signup) legitimately has no Supabase session
// at all — the business hasn't been claimed/paid for yet. Fix, in two
// tiers:
//   1. Takes only `technicianId` now; phone/name/businessName/techUrl(pin)
//      are all read from the technicians/businesses rows, never trusted
//      from the request body — closes the "arbitrary content/number"
//      half of the risk unconditionally, for both call sites.
//   2. If the target business already has an owner_user_id (i.e. it's been
//      claimed post-payment — see RequireBusinessAuth.jsx), a real
//      Authorization bearer proving the caller owns it is REQUIRED
//      (DispatcherView's two call sites, both real dispatcher sessions).
//      If it does NOT yet have an owner (fresh pre-payment onboarding, the
//      Onboarding.jsx call site — genuinely no session to check), the
//      request is allowed through unauthenticated but rate-limited to 3
//      sends/hour per technicianId via the existing check_rate_limit RPC
//      (see ai-intake-chat/client-support-chat for the same pattern) —
//      caps a direct-API replay attack against one fabricated
//      business+technician row. This does NOT eliminate the broader
//      "anyone can fill out the public signup form with an arbitrary phone
//      number" surface — that's the onboarding flow's own problem, common
//      to any self-serve SaaS signup, and a separate concern from this
//      function's specific gap.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone } from "../_shared/sms.ts"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-setup-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { technicianId } = await req.json()
    if (!technicianId) throw new Error('technicianId is required')

    const APP_URL = Deno.env.get('APP_URL')
    if (!APP_URL) throw new Error('APP_URL not configured in Supabase secrets')

    const { data: technician, error: techErr } = await supabase
      .from('technicians')
      .select('id, name, phone, pin, business_id, businesses(name, owner_user_id, contact_email)')
      .eq('id', technicianId)
      .maybeSingle()
    if (techErr || !technician) throw new Error('Technician not found')

    const biz = (technician as any).businesses

    if (biz?.owner_user_id) {
      // This business has already been claimed (post-payment) — same rule
      // as every other dispatcher-triggered function this round: a real
      // caller identity proving ownership is required.
      const caller = await getAuthenticatedCaller(req, supabase)
      if (!caller) {
        return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
      if (!isOwnerOfBusiness(biz, caller.id, caller.email)) {
        return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
          status: 403,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
    } else {
      // No owner yet — genuinely could be the real, unauthenticated
      // Onboarding.jsx flow. Can't check identity, so rate-limit instead:
      // caps how many times a forged/replayed request can hit the same
      // technicianId.
      const { data: withinLimit, error: rlErr } = await supabase.rpc('check_rate_limit', {
        p_key: `setup-sms:${technicianId}`,
        p_window_seconds: 3600,
        p_max_requests: 3,
      })
      if (rlErr) {
        console.error('send-setup-sms: rate limit check failed, allowing request through', rlErr)
      } else if (withinLimit === false) {
        return new Response(JSON.stringify({ error: 'Too many requests for this technician — please try again in a few minutes.' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        })
      }
    }

    if (!technician.phone) {
      return new Response(JSON.stringify({ error: 'This technician has no phone number on file' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const businessName = biz?.name || 'your dispatcher'
    const techUrl = `${APP_URL}/tech?pin=${technician.pin}`
    const formattedPhone = formatAuPhone(technician.phone)

    const message = `Hi ${technician.name}, you've been added to ${businessName}'s Minerva tracking system.\n\nOpen this link on your phone to start tracking:\n${techUrl}\n\nYou'll need to allow location access when prompted. Any issues, reply to this message.`

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
        body: new URLSearchParams({ To: formattedPhone, From: TWILIO_FROM, Body: message }).toString(),
      }
    )

    const result = await response.json()

    if (result.error_code) {
      throw new Error(`Twilio error ${result.error_code}: ${result.message}`)
    }

    supabase.rpc('record_agent_run', { fn_name: 'send-setup-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, sid: result.sid }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  } catch (err) {
    console.error('send-setup-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-setup-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    })
  }
})
