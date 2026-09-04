// Supabase Edge Function: xero-oauth-connect
// Step 1 of a real Xero OAuth 2.0 connection — redirects the browser to
// Xero's own login/consent screen. This is Xero's actual, publicly
// documented, self-serve developer flow (https://developer.xero.com/ —
// free to register, no partnership/commercial-approval gate, unlike
// Reece/Bunnings/Middy's or ATO STP, which do require one). It is NOT
// functional until you've done two real things this build can't do for
// you:
//   1. Register a free app at https://developer.xero.com/app/manage,
//      set its redirect URI to <SUPABASE_URL>/functions/v1/xero-oauth-callback
//   2. Set the XERO_CLIENT_ID and XERO_CLIENT_SECRET secrets on this
//      project (supabase secrets set XERO_CLIENT_ID=... XERO_CLIENT_SECRET=...)
// Until both are done, this function returns a 501 explaining exactly
// that, rather than pretending to redirect somewhere real.
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

  const urlParams = new URL(req.url).searchParams
  const businessIdParam = urlParams.get('businessId')
  if (businessIdParam) {
    // Minerva Max: xero_sync is a paid add-on — defense in depth alongside
    // the frontend gate (Settings only shows "Connect Xero" once enabled).
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const { data: biz } = await supabase.from('businesses').select('max_addons, max_addon_trials').eq('id', businessIdParam).maybeSingle()
    const addonActive = biz?.max_addons?.xero_sync === true ||
      (biz?.max_addon_trials?.xero_sync?.ends_at && new Date(biz.max_addon_trials.xero_sync.ends_at).getTime() > Date.now())
    if (!addonActive) {
      return new Response(JSON.stringify({ error: 'Xero Sync is a Minerva Max add-on — enable it from the MAX tab first.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
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

  const url = new URL(req.url)
  const businessId = url.searchParams.get('businessId')
  if (!businessId) {
    return new Response(JSON.stringify({ error: 'businessId query param is required' }), {
      status: 400,
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
  // NOTE: state is just the raw businessId here, no signing/nonce — fine
  // for this build's single-operator-owned Supabase project, but a genuine
  // multi-tenant SaaS should sign this to prevent a forged callback from
  // linking a Xero org to the wrong business.
  authorizeUrl.searchParams.set('state', businessId)

  return new Response(null, {
    status: 302,
    headers: { 'Location': authorizeUrl.toString(), 'Access-Control-Allow-Origin': '*' },
  })
})
