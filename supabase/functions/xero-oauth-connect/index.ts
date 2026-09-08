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
// protect). Without this, anyone who knows/guesses a businessId could link
// their own Xero org to a victim business (a forged-callback CSRF risk) —
// fixed 2026-09-08.
// Deploy with: supabase functions deploy xero-oauth-connect --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const clientId = Deno.env.get('XERO_CLIENT_ID')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
  const addonActive = biz?.max_addons?.xero_sync === true ||
    (biz?.max_addon_trials?.xero_sync?.ends_at && new Date(biz.max_addon_trials.xero_sync.ends_at).getTime() > Date.now())
  if (!addonActive) {
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

  const redirectUri = `${supabaseUrl}/functions/v1/xero-oauth-callback`
  const scope = 'openid profile email accounting.transactions accounting.contacts offline_access'
  const authorizeUrl = new URL('https://login.xero.com/identity/connect/authorize')
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', clientId)
  authorizeUrl.searchParams.set('redirect_uri', redirectUri)
  authorizeUrl.searchParams.set('scope', scope)
  // state is the raw businessId — no longer the only line of defense against
  // a forged callback linking the wrong business, since reaching this point
  // already required proving ownership of businessIdParam above.
  authorizeUrl.searchParams.set('state', businessIdParam)

  // Returned as JSON (not a 302) so the frontend can attach an Authorization
  // header to this request (ownership check above) and then navigate the
  // browser to the URL itself via window.location — a plain <a href> or
  // redirect can't carry that header.
  return new Response(JSON.stringify({ url: authorizeUrl.toString() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
})
