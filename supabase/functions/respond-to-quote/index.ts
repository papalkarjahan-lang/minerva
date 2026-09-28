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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isValidResponseStatus, canRespond } from "./logic.ts"

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
      .select('id, business_id, status, client_name, total')
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
