// Supabase Edge Function: send-quote-sms
// Direct invocation: { quoteId }. Fired only from a dispatcher's explicit
// "Send to Client" click in DispatcherView (Quotes tab) — this is a
// Sales & Marketing-style outbound message, so like every other function in
// that pillar it never fires on its own; a human approves each send.
// Texts the client a link to their quote (QuoteView.jsx) and marks the
// quote 'sent'.
// Deploy with: supabase functions deploy send-quote-sms
//
// Kill-switch/health wiring added 2026-09-23: this was never registered in
// agent_functions at all, despite being the same Sales & Marketing SMS
// category as send-eta-sms/send-completion-sms (already registered/gated) —
// found via a directory-vs-agent_functions diff. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.
//
// Ownership check added 2026-09-24 (Round 43): had verify_jwt:false and no
// check that the caller has any relationship to the business that owns
// quoteId — meaning an unauthenticated stranger who knew/guessed a quoteId
// could force-send a real SMS to that quote's client. Fixed using the same
// isOwner pattern xero-oauth-connect already used for the identical
// forged-request risk.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { formatAuPhone } from "../_shared/sms.ts"
import { isAddonActive } from "../_shared/maxAddons.ts"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'send-quote-sms').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { quoteId } = await req.json()
    if (!quoteId) throw new Error('quoteId is required')

    const { data: quote, error } = await supabase.from('quotes').select('*, businesses(name, owner_user_id, contact_email, max_addons, max_addon_trials)').eq('id', quoteId).maybeSingle()
    if (error || !quote) throw new Error('quote not found')
    if (!quote.client_phone) throw new Error('This quote has no client phone number on file')
    if (quote.status !== 'draft') throw new Error(`Quote already ${quote.status} — refusing to send twice`)

    const biz = (quote as any).businesses

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
    if (!isOwnerOfBusiness(biz, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Minerva Max: ai_quotes is a paid add-on — defense in depth alongside
    // the frontend gate (DispatcherView's Quotes tab "Send to Client" button).
    if (!isAddonActive(biz, 'ai_quotes')) {
      return new Response(JSON.stringify({ error: 'AI Quote Drafting is a Minerva Max add-on — enable it from the MAX tab first.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
    const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
    const APP_URL = Deno.env.get('APP_URL') || ''
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      throw new Error('Twilio credentials not configured in Supabase secrets')
    }

    // Atomically claim the quote before sending any real SMS — the status
    // check above alone is a time-of-check/time-of-use race (a double-click
    // on "Send to Client", or a retried request, could both pass it before
    // either writes a new status). This conditional update only succeeds for
    // whichever request gets there first; a second concurrent request sees
    // 0 rows affected and bails out before ever messaging the client twice.
    const { data: claimed, error: claimErr } = await supabase
      .from('quotes')
      .update({ status: 'sending' })
      .eq('id', quoteId)
      .eq('status', 'draft')
      .select('id')
    if (claimErr) throw claimErr
    if (!claimed || claimed.length === 0) throw new Error('Quote already being sent — refusing to send twice')

    const phone = formatAuPhone(quote.client_phone)

    const bizName = (quote as any).businesses?.name || 'the business'
    const link = `${APP_URL}/quote/${quote.id}`
    const message = `Hi ${quote.client_name || ''}, here's your quote from ${bizName} ($${Number(quote.total).toFixed(2)} inc. GST): ${link}`.trim()

    try {
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: phone, From: TWILIO_FROM, Body: message }).toString(),
      })
      const result = await res.json().catch(() => ({}))
      if (result.error_code) throw new Error(`Twilio rejected the send: ${result.error_message || result.error_code}`)
    } catch (sendErr) {
      // Claimed the quote ('sending') but the send itself failed — revert to
      // 'draft' rather than stranding it in 'sending' forever with no retry
      // path (the draft-only check above would otherwise block a retry).
      await supabase.from('quotes').update({ status: 'draft' }).eq('id', quoteId)
      throw sendErr
    }

    await supabase.from('quotes').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', quoteId)

    supabase.rpc('record_agent_run', { fn_name: 'send-quote-sms', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('send-quote-sms error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'send-quote-sms', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
