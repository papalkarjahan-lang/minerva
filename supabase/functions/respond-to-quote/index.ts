// Supabase Edge Function: respond-to-quote
// Public, unauthenticated POST — called from QuoteView.jsx when a client
// clicks Accept/Decline on their own quote (same unguessable-link-is-the-
// bearer-token model as the rest of quotes/invoices, see
// supabase_schema_delta_rls_scoping_v4.sql). Previously QuoteView.jsx wrote
// `quotes.status` directly with the anon key — that write itself is fine
// (RLS already scopes it correctly), but it meant a client accepting or
// declining a quote could never fire the business's own configured
// 'quote.accepted'/'quote.declined' custom-workflow rules, since
// run-custom-workflows' direct-invocation path requires either the real
// service-role key or an authenticated owner/technician (a public client
// visitor is neither, and rightly so — see that function's header comment
// on the forged-trigger risk of accepting an unauthenticated businessId).
// This function is the mediating layer: it re-derives business_id and the
// quote's own current status server-side (never trusts either from the
// client), enforces a legal draft->sent->accepted/declined transition via
// logic.ts, performs the update itself, then fires the workflow trigger
// with the trusted service-role key — the same "browser hits a public edge
// function, edge function holds the real credential" pattern already used
// by track-review-click.
//
// Deploy with: supabase functions deploy respond-to-quote --no-verify-jwt
//
// No agent_functions.enabled kill-switch check here — deliberately, same
// reasoning as track-review-click: this fires when a real client clicks
// Accept/Decline on a link already sent to their own phone/inbox, so a
// kill switch could only ever turn a working response link into a broken
// one for someone who already has it, not prevent an unwanted send. The
// one real external side-effect this triggers (run-custom-workflows,
// which can fire a business's own SMS/email/Slack rules) already has its
// own enabled check, so that path stays governable without gating the
// client's own accept/decline action itself.
//
// Baseline SMS+Slack notification added 2026-10-05: run-custom-workflows
// only does anything for businesses that have manually set up a
// 'quote.accepted'/'quote.declined' workflow row — the default, out-of-
// the-box state for every business is zero rows, meaning the entire
// `for (const wf of workflows)` loop in that function is a no-op and
// nothing ever told the business a client responded at all. Every other
// comparable "something just happened" event in this codebase (a new
// lead, a missed call, a support request) fires an unconditional baseline
// notification regardless of any opt-in config — a quote acceptance,
// arguably the single most actionable event, had none. This adds exactly
// that, unconditionally, alongside the still-unchanged custom-workflow
// trigger below for businesses that have set up extra automation on top.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isValidResponseStatus, canRespond } from "./logic.ts"
import { sendTwilioSms } from "../_shared/twilioSms.ts"
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
    const quoteId: string | null = body.quoteId || null
    const status: string | null = body.status || null

    if (!quoteId || !isValidResponseStatus(status)) {
      return new Response(JSON.stringify({ error: 'quoteId and a valid status (accepted or declined) are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: quote } = await supabase
      .from('quotes')
      .select('id, business_id, status, client_name, client_phone, total, description, lead_id, businesses(contact_phone)')
      .eq('id', quoteId)
      .maybeSingle()

    if (!quote) {
      return new Response(JSON.stringify({ error: 'This quote link is invalid or has expired.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!canRespond(quote.status)) {
      // Not an error for the client — most likely they already responded
      // (e.g. double-clicked, or reopened an old link) or the business
      // hasn't sent it yet. Report the quote's real current status either way.
      return new Response(JSON.stringify({ success: true, status: quote.status, alreadyResolved: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Atomically claim this quote before firing the workflow trigger — the
    // .eq('status', quote.status) guard means only the first of two
    // concurrent requests (e.g. a double-clicked Accept, or a retried
    // request) actually transitions the row; the loser gets zero rows back
    // and is treated the same as canRespond() already false above, instead
    // of also firing a duplicate workflow trigger. Same claim-before-side-
    // effect pattern as chase-unpaid-invoices (fixed 2026-09-24).
    const { data: claimed, error: updateError } = await supabase
      .from('quotes')
      .update({ status })
      .eq('id', quoteId)
      .eq('status', quote.status)
      .select('id')
    if (updateError) throw updateError
    if (!claimed || claimed.length === 0) {
      return new Response(JSON.stringify({ success: true, status: quote.status, alreadyResolved: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Baseline notification — see header note. Fires regardless of any
    // custom-workflow setup, fire-and-forget so a Twilio/Slack hiccup can
    // never block the client's own accept/decline from succeeding.
    const totalText = quote.total != null ? ` ($${Number(quote.total).toFixed(2)})` : ''
    const notifyText = status === 'accepted'
      ? `✅ Quote accepted: *${quote.client_name || 'A client'}*${totalText} — get them on the schedule.`
      : `❌ Quote declined: *${quote.client_name || 'A client'}*${totalText}.`
    const bizPhone = (quote as any).businesses?.contact_phone
    if (bizPhone) {
      sendTwilioSms(
        { sid: Deno.env.get('TWILIO_ACCOUNT_SID'), token: Deno.env.get('TWILIO_AUTH_TOKEN'), from: Deno.env.get('TWILIO_PHONE_NUMBER') },
        bizPhone,
        notifyText.replace(/[*_]/g, ''),
        'respond-to-quote'
      ).catch(() => {})
    }
    notifySlack(supabaseUrl, supabaseServiceKey, quote.business_id, notifyText).catch(() => {})

    // Quote-to-job bridge, added 2026-10-29: previously an accepted quote
    // was just a status flip — someone still had to re-type the client's
    // name, phone, and job description into a brand-new job by hand, work
    // that was already done once at quote time. Auto-creates a draft job
    // instead, fire-and-forget so a failure here can never block the
    // client's own accept from succeeding (same resilience shape as the
    // Slack/SMS notifications above).
    //
    // Honesty note on the address: neither `quotes` nor `leads` stores a
    // full street address (leads only has `suburb`, a rough area, not
    // something precise enough to geocode confidently) — this was never
    // collected at quote time. Using the lead's suburb as a best-effort
    // client_address is still strictly better than leaving it blank: if
    // it's too vague to geocode, AddJobModal's own best-effort geocoding
    // fix (2026-10-29) already handles that gracefully (job saved, no map
    // pin yet) rather than failing. The job's notes make clear the exact
    // address still needs confirming — this is a draft to save re-typing,
    // not a claim that the address is already correct.
    if (status === 'accepted') {
      (async () => {
        let suburb = null
        if (quote.lead_id) {
          const { data: lead } = await supabase.from('leads').select('suburb').eq('id', quote.lead_id).maybeSingle()
          suburb = lead?.suburb || null
        }
        const { error: jobInsertErr } = await supabase.from('jobs').insert({
          business_id: quote.business_id,
          client_name: quote.client_name,
          client_phone: quote.client_phone,
          client_address: suburb,
          notes: `Auto-created from accepted quote${quote.total != null ? ` ($${Number(quote.total).toFixed(2)})` : ''}. ${suburb ? 'Confirm the exact address — only the suburb was known at quote time.' : 'No address on file yet — add one before dispatching.'}${quote.description ? ` Original request: ${quote.description}` : ''}`,
          status: 'scheduled',
        })
        if (jobInsertErr) console.error('respond-to-quote: job auto-creation failed:', jobInsertErr.message)
      })().catch(() => {})
    }

    // Fire-and-forget: a workflow misconfiguration/outage on the business's
    // end must never block the client's own accept/decline from succeeding.
    fetch(`${supabaseUrl}/functions/v1/run-custom-workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
      body: JSON.stringify({
        businessId: quote.business_id,
        event: status === 'accepted' ? 'quote.accepted' : 'quote.declined',
        payload: { quote_id: quote.id, client_name: quote.client_name, total: quote.total },
      }),
    }).catch(() => {})

    supabase.rpc('record_agent_run', { fn_name: 'respond-to-quote', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('respond-to-quote error:', err)
    supabase.rpc('record_agent_run', { fn_name: 'respond-to-quote', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
