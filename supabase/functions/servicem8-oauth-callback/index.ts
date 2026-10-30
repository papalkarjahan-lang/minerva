// Supabase Edge Function: servicem8-oauth-callback
// Step 2 of the ServiceM8 OAuth flow — ServiceM8 redirects here after the
// business owner approves the connection on ServiceM8's own screen.
// Exchanges the authorization code for real access/refresh tokens and
// stores them in integration_credentials (provider='servicem8') — the
// same table Xero already uses, built provider-agnostic from the start,
// so no new credentials table was needed (see
// supabase_schema_delta_servicem8_oauth.sql header).
//
// Direct adaptation of xero-oauth-callback/index.ts, including its
// already-hardened state-token handling (see that file's 2026-09-25
// header comment for the forged-callback vulnerability this avoids
// reintroducing): `state` is resolved ONLY from a matching, unexpired,
// unconsumed row in servicem8_oauth_states, atomically claimed (deleted)
// on lookup so a replayed callback can't reuse it — never trusted as a
// client-supplied business_id directly.
//
// Unlike Xero, ServiceM8 has no multi-org "tenant" concept to resolve
// after the token exchange — a successful token exchange on its own is
// the complete proof of connection, so there's no equivalent of Xero's
// "fetch connections, verify a tenant id exists" step.
//
// Requires SERVICEM8_CLIENT_ID, SERVICEM8_CLIENT_SECRET, and
// SUPABASE_SERVICE_ROLE_KEY secrets set on this project.
//
// NOT YET TESTED against a live ServiceM8 sandbox — see
// servicem8-oauth-connect/index.ts header. The token-exchange request
// shape (client_id/client_secret in the POST body, not a Basic auth
// header) follows RFC 6749's most widely-supported form rather than
// Xero's specific Basic-auth convention, since ServiceM8's own docs
// don't document which their token endpoint expects — verify this
// against a real request once real credentials exist, and switch to a
// Basic auth header here if the body-based attempt is rejected.
//
// Deploy with: supabase functions deploy servicem8-oauth-callback --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const appUrl = Deno.env.get('APP_URL') || supabaseUrl
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateToken = url.searchParams.get('state')
  const sm8Error = url.searchParams.get('error')

  // Resolved below from servicem8_oauth_states — NEVER trust a business_id
  // supplied directly by the caller (see header comment above).
  let businessId: string | null = null

  function redirectWithStatus(status: 'connected' | 'failed', detail?: string) {
    const dest = new URL(`${appUrl}/dispatch/${businessId || ''}`)
    dest.searchParams.set('servicem8', status)
    if (detail) dest.searchParams.set('servicem8_detail', detail)
    supabase.rpc('record_agent_run', status === 'connected'
      ? { fn_name: 'servicem8-oauth-callback', status: 'ok' }
      : { fn_name: 'servicem8-oauth-callback', status: 'error', error_msg: detail || 'failed' }).then(() => {}, () => {})
    return new Response(null, { status: 302, headers: { 'Location': dest.toString(), 'Access-Control-Allow-Origin': '*' } })
  }

  if (!stateToken) return redirectWithStatus('failed', 'missing_state')

  // Atomically claim (delete-and-return) the pending state row — the ONLY
  // source of truth for which business this callback belongs to.
  const { data: claimedState, error: claimStateError } = await supabase
    .from('servicem8_oauth_states')
    .delete()
    .eq('state', stateToken)
    .select('business_id, expires_at')
    .maybeSingle()
  if (claimStateError) {
    console.error('servicem8-oauth-callback: state claim failed:', claimStateError.message)
    return redirectWithStatus('failed', 'state_lookup_error')
  }
  if (!claimedState || new Date(claimedState.expires_at) < new Date()) {
    return redirectWithStatus('failed', 'invalid_or_expired_state')
  }
  businessId = claimedState.business_id

  if (sm8Error) return redirectWithStatus('failed', sm8Error)
  if (!code) return redirectWithStatus('failed', 'missing_code')

  const clientId = Deno.env.get('SERVICEM8_CLIENT_ID')
  const clientSecret = Deno.env.get('SERVICEM8_CLIENT_SECRET')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!clientId || !clientSecret || !serviceRoleKey) {
    return redirectWithStatus('failed', 'servicem8_not_configured')
  }

  try {
    const redirectUri = `${supabaseUrl}/functions/v1/servicem8-oauth-callback`

    const tokenRes = await fetch('https://go.servicem8.com/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })
    if (!tokenRes.ok) return redirectWithStatus('failed', `token_exchange_${tokenRes.status}`)
    const tokens = await tokenRes.json()
    if (!tokens.access_token) return redirectWithStatus('failed', 'no_access_token_in_response')

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString()

    await supabase.from('integration_credentials').upsert({
      business_id: businessId,
      provider: 'servicem8',
      tenant_id: null, // no multi-org concept for ServiceM8 — see header comment
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'business_id,provider' })

    await supabase.from('businesses').update({ servicem8_connected: true }).eq('id', businessId)

    return redirectWithStatus('connected')
  } catch (err) {
    console.error('servicem8-oauth-callback error:', err)
    return redirectWithStatus('failed', 'exception')
  }
})
