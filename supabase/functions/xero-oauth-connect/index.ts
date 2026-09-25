// Supabase Edge Function: xero-oauth-connect
// Step 1 of a real Xero OAuth 2.0 connection — returns the URL of Xero's own
// login/consent screen for the caller's browser to navigate to. This is
// Xero's actual, publicly documented, self-serve developer flow
// (https://developer.xero.com/ — free to register, no partnership/
// commercial-approval gate, unlike Reece/Bunnings/Middy's or ATO STP, which
// do require one). It is NOT functional until you've done two real things
// this build can't do for you:
//   1. Register a free app at https://developer.xero.com/app/manage,
//      set its redirect URI to <SUPABASE_URL>/functions/v1/xero-oauth-callback
//   2. Set the XERO_CLIENT_ID and XERO_CLIENT_SECRET secrets on this
//      project (supabase secrets set XERO_CLIENT_ID=... XERO_CLIENT_SECRET=...)
// Until both are done, this function returns a 501 explaining exactly
// that, rather than pretending to redirect somewhere real.
//
// Auth: requires an `Authorization: Bearer <supabase-access-token>` header
// proving the caller is actually logged in as the target business's owner
// (same ownership check as RequireBusinessAuth.jsx, enforced here too since
// this is a public Edge Function URL that the client-side route guard can't
// protect). Without this, anyone who knows/guesses a businessId could start
// a flow that links their own Xero org to a victim business — fixed
// 2026-09-08.
//
// Forged-callback fix (2026-09-25): this ownership check alone was NOT
// sufficient, because it only gated who could START a flow, not who Xero
// would ultimately call back for. The `state` param used to be the raw
// businessId, and Xero never validates `state` against anything — it's
// an opaque value the client sets and gets echoed back unchanged.
// Anyone who knew Minerva's client_id/redirect_uri (learnable from one
// legitimate flow — neither is secret) could construct their own Xero
// authorize URL, log in with their OWN Xero account, and set `state` to
// any victim's business_id directly — xero-oauth-callback would then
// attach the attacker's real Xero tokens to the victim's business_id,
// silently leaking every future invoice sync to the attacker's Xero org.
// Fixed by minting a random, single-use, 15-minute state token (see
// supabase_schema_delta_xero_oauth_state.sql) only after this ownership
// check passes, and having xero-oauth-callback trust ONLY a business_id
// it looked up from a matching, unexpired, unconsumed state row — never
// a client-supplied value.
//
// Registered in agent_functions with a real enabled-check (kill-switch
// capable, unlike xero-oauth-callback/track-review-click) — this is the
// entry point of the flow, before the business owner has approved anything
// on Xero's side, so disabling it just stops new connections from starting
// rather than stranding one already in progress. (Fixed 2026-09-23, Round
// 40 — this function existed with no agent_functions row at all, same bug
// class as the earlier registration-gap rounds.)
//
// Deploy with: supabase functions deploy xero-oauth-connect --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isAddonActive } from "../_shared/maxAddons.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const clientId = Deno.env.get('XERO_CLIENT_ID')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'xero-oauth-connect').maybeSingle()
  if (fnState?.enabled === false) {
    return new Response(JSON.stringify({ error: 'Xero Sync is temporarily disabled.' }), {
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

  // Ownership check: caller must present a valid Supabase Auth access token
  // for the user who owns (or, per the same auto-claim rule as
  // RequireBusinessAuth.jsx, has a matching contact_email for) this business.
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
    .select('owner_user_id, contact_email, max_addons, max_addon_trials')
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

  // Minerva Max: xero_sync is a paid add-on — defense in depth alongside
  // the frontend gate (Settings only shows "Connect Xero" once enabled).
  if (!isAddonActive(biz, 'xero_sync')) {
    return new Response(JSON.stringify({ error: 'Xero Sync is a Minerva Max add-on — enable it from the MAX tab first.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  if (!clientId) {
    return new Response(JSON.stringify({
      error: 'Xero integration not configured yet.',
      detail: 'Register a free app at https://developer.xero.com/app/manage, set its redirect URI to ' +
        `${supabaseUrl}/functions/v1/xero-oauth-callback, then set the XERO_CLIENT_ID and XERO_CLIENT_SECRET secrets on this project.`,
    }), {
      status: 501,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  // Mint a random, unguessable, single-use, short-lived state token bound
  // to businessIdParam — see supabase_schema_delta_xero_oauth_state.sql
  // header for the forged-callback vulnerability this closes. Xero itself
  // never validates `state`, so passing the raw businessId (the old
  // behaviour) let anyone who knew Minerva's client_id/redirect_uri (not
  // secret — learnable from one legitimate flow) forge their own Xero
  // login with `state` set to any victim business_id, silently attaching
  // their own real Xero tokens to that victim's business_id in
  // xero-oauth-callback. This token has no meaning to Xero except as an
  // opaque value it echoes back unchanged — the actual security is in
  // xero-oauth-callback only trusting a business_id it looked up from a
  // matching, unexpired, not-yet-consumed row in xero_oauth_states.
  const state = crypto.randomUUID()
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
  const { error: stateInsertError } = await supabase.from('xero_oauth_states').insert({
    state,
    business_id: businessIdParam,
    expires_at: expiresAt,
  })
  if (stateInsertError) {
    console.error('xero-oauth-connect: failed to persist oauth state:', stateInsertError.message)
    return new Response(JSON.stringify({ error: 'Could not start the Xero connection. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }

  const redirectUri = `${supabaseUrl}/functions/v1/xero-oauth-callback`
  const scope = 'openid profile email accounting.transactions accounting.contacts offline_access'
  const authorizeUrl = new URL('https://login.xero.com/identity/connect/authorize')
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', scope)
  authorizeUrl.searchParams.set('state', state)

  supabase.rpc('record_agent_run', { fn_name: 'xero-oauth-connect', status: 'ok' }).then(() => {}, () => {})

  // Returned as JSON (not a 302) so the frontend can attach an Authorization
  // header to this request (ownership check above) and then navigate the
  // browser to the URL itself via window.location — a plain <a href> or
  // redirect can't carry that header.
  return new Response(JSON.stringify({ url: authorizeUrl.toString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})
