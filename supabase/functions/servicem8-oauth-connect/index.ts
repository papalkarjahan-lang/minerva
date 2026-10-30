// Supabase Edge Function: servicem8-oauth-connect
// Step 1 of a real ServiceM8 OAuth 2.0 connection — returns the URL of
// ServiceM8's own login/consent screen for the caller's browser to
// navigate to. Direct adaptation of xero-oauth-connect/index.ts (same
// ownership check, same single-use state-token forged-callback
// protection, applied here from the start rather than as a later fix —
// see that file's header for the full vulnerability this avoids
// reintroducing).
//
// This is the backend half of the "fit in, not replace" integration
// strategy: a business keeps ServiceM8 for dispatch/invoicing, and
// connects it to Minerva for whole-fleet route optimization, AI call
// handling, and review/win-back automation — the pieces ServiceM8 is
// weakest at — instead of migrating off a system they already use.
//
// NOT functional until two real things this build can't do for you:
//   1. Register a free app at https://developer.servicem8.com (sign up,
//      create an app), set its redirect URI to
//      <SUPABASE_URL>/functions/v1/servicem8-oauth-callback
//   2. Set the SERVICEM8_CLIENT_ID and SERVICEM8_CLIENT_SECRET secrets
//      on this project.
// Until both are done, this function returns a 501 explaining exactly
// that, rather than pretending to redirect somewhere real — same
// honest-unconfigured pattern as every other integration in this build.
//
// Deliberately NOT gated behind a Minerva Max add-on yet — unlike
// xero-oauth-connect's isAddonActive(biz, 'xero_sync') check, this
// integration's pricing/tier placement hasn't been decided. Wiring a
// specific price in here would be inventing a business decision that
// isn't mine to make. The ownership check below is NOT optional, though
// — that's a security requirement independent of any pricing question.
//
// NOT YET TESTED against a live ServiceM8 sandbox — endpoints and scope
// names are from ServiceM8's own published docs (developer.servicem8.com),
// not verified end-to-end the way the Xero flow has been through real
// production traffic. Smoke-test this once a real app is registered,
// the same way every other integration in this project got its first
// real verification.
//
// Deploy with: supabase functions deploy servicem8-oauth-connect --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const clientId = Deno.env.get('SERVICEM8_CLIENT_ID')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'servicem8-oauth-connect').maybeSingle()
  if (fnState?.enabled === false) {
    return new Response(JSON.stringify({ error: 'ServiceM8 connect is temporarily disabled.' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const urlParams = new URL(req.url).searchParams
  const businessIdParam = urlParams.get('businessId')
  if (!businessIdParam) {
    return new Response(JSON.stringify({ error: 'businessId query param is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Ownership check — identical reasoning to xero-oauth-connect: this is
  // a public Edge Function URL the client-side route guard can't protect,
  // so the caller's Supabase Auth token is verified against the target
  // business here, not just trusted from the query string.
  const authHeader = req.headers.get('Authorization') || ''
  const accessToken = authHeader.replace(/^Bearer\s+/i, '')
  if (!accessToken) {
    return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const { data: biz } = await supabase.from('businesses')
    .select('owner_user_id, contact_email')
    .eq('id', businessIdParam).maybeSingle()
  if (!biz) {
    return new Response(JSON.stringify({ error: 'Business not found.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  const isOwner = biz.owner_user_id === userData.user.id ||
    (!biz.owner_user_id && biz.contact_email && biz.contact_email.toLowerCase() === (userData.user.email || '').toLowerCase())
  if (!isOwner) {
    return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  if (!clientId) {
    return new Response(JSON.stringify({
      error: 'ServiceM8 integration not configured yet.',
      detail: 'Register a free app at https://developer.servicem8.com, set its redirect URI to ' +
        `${supabaseUrl}/functions/v1/servicem8-oauth-callback, then set the SERVICEM8_CLIENT_ID and SERVICEM8_CLIENT_SECRET secrets on this project.`,
    }), {
      status: 501,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Single-use, 15-minute state token bound to businessIdParam — see
  // header comment. ServiceM8 never validates `state` against anything
  // (standard OAuth2 behaviour, same as Xero), so this table — not the
  // raw businessId — is the only thing servicem8-oauth-callback trusts
  // to resolve which business a callback belongs to.
  const state = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const { error: stateInsertError } = await supabase.from('servicem8_oauth_states').insert({
    state,
    business_id: businessIdParam,
    expires_at: expiresAt,
  })
  if (stateInsertError) {
    console.error('servicem8-oauth-connect: failed to persist oauth state:', stateInsertError.message)
    return new Response(JSON.stringify({ error: 'Could not start the ServiceM8 connection. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const redirectUri = `${supabaseUrl}/functions/v1/servicem8-oauth-callback`
  // Minimal scope for what this integration actually needs: read jobs and
  // staff to run the fleet optimizer against real data, manage_jobs to
  // write an optimized stop order back. No customer/billing scopes
  // requested — this integration doesn't touch invoicing, which stays in
  // ServiceM8 on purpose (see header comment).
  const scope = 'read_jobs manage_jobs read_staff vendor'
  const authorizeUrl = new URL('https://go.servicem8.com/oauth/authorize')
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', scope)
  authorizeUrl.searchParams.set('state', state)

  supabase.rpc('record_agent_run', { fn_name: 'servicem8-oauth-connect', status: 'ok' }).then(() => {}, () => {})

  // JSON, not a 302 — same reasoning as xero-oauth-connect: the frontend
  // needs to attach the Authorization header to this request (for the
  // ownership check above), which a plain redirect/<a href> can't carry.
  return new Response(JSON.stringify({ url: authorizeUrl.toString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})
