// Supabase Edge Function: outreach-unsubscribe
// Public, unauthenticated GET link clicked directly from a real prospect's
// email — no Supabase auth session possible, so this MUST be deployed with
// --no-verify-jwt (same category as track-review-click/xero-oauth-connect/
// calendar-feed).
// URL: /functions/v1/outreach-unsubscribe?id=<outreach_prospects.id>
//
// Compliance fix (2026-09-25): until now, the ONLY unsubscribe mechanism
// for Minerva's own cold outreach emails (send-outreach-batch) was a plain
// "reply \"unsubscribe\"" text line (see draft-outreach-batch's
// UNSUBSCRIBE_LINE) — a human then has to notice that reply and manually
// flip outreach_prospects.unsubscribed_at via the admin console. The
// Spam Act 2003 (Cth) requires every commercial electronic message to
// carry a FUNCTIONAL unsubscribe facility; a reply that depends on a human
// reading an inbox is fragile (easy to miss, and does nothing at all if
// that inbox is ever unmonitored) and arguably doesn't meet that bar on
// its own. This function is the real, self-service, one-click mechanism:
// send-outreach-batch now appends a genuine "Unsubscribe" link (this
// function's URL, keyed by the prospect's own row id — already an
// unguessable UUID primary key, same unguessable-link-as-authorization
// pattern already used by track-review-click's review_requests.id and
// calendar-feed's businessId) to the FIXED HTML FOOTER of every outreach
// email, outside the human-editable draft_body — so it can never be
// accidentally removed by whoever reviews/edits a draft in the admin
// console, unlike the reply-based text line living inside the AI-drafted
// or hand-written body itself. The reply-based line is left in place too
// (some recipients will just reply regardless) — this is an addition, not
// a replacement.
//
// Idempotent: clicking twice, or a link crawled/pre-fetched by an email
// client's link-scanning security feature, just re-sets the same
// unsubscribed_at (harmless) rather than erroring.
//
// Deploy with: supabase functions deploy outreach-unsubscribe --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

function page(message: string): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Minerva</title></head>` +
    `<body style="font-family:sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#1B2B4B;">` +
    `<p>${message}</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Access-Control-Allow-Origin': '*' } }
  )
}

serve(async (req: Request) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  if (!id) return page("This unsubscribe link is missing some information — reply to any of our emails and we'll take care of it by hand.")

  const { data: prospect, error } = await supabase
    .from('outreach_prospects')
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('outreach-unsubscribe: update failed:', error.message)
    supabase.rpc('record_agent_run', { fn_name: 'outreach-unsubscribe', status: 'error', error_msg: error.message }).then(() => {}, () => {})
    return page("Something went wrong on our end — reply to any of our emails and we'll unsubscribe you by hand.")
  }

  if (!prospect) {
    // Unknown/already-deleted id — not an error a real recipient caused,
    // so no error_msg here, but still worth an ok run record for visibility.
    supabase.rpc('record_agent_run', { fn_name: 'outreach-unsubscribe', status: 'ok' }).then(() => {}, () => {})
    return page("You're not on our list, so there's nothing to unsubscribe from.")
  }

  supabase.rpc('record_agent_run', { fn_name: 'outreach-unsubscribe', status: 'ok' }).then(() => {}, () => {})
  return page("You're unsubscribed — we won't email you again.")
})
