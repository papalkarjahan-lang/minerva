// Supabase Edge Function: xero-oauth-callback
// Step 2 of the Xero OAuth flow — Xero redirects here after the business
// owner approves the connection on Xero's own screen. Exchanges the
// authorization code for real access/refresh tokens, fetches which Xero
// org (tenant) was authorized, and stores the tokens in
// integration_credentials — a table intentionally NOT covered by this
// codebase's usual "anon all" RLS policy (see supabase_schema_delta_
// minerva_max.sql header). This function uses SUPABASE_SERVICE_ROLE_KEY
// specifically because these are real third-party credentials, unlike the
// demo-style data everywhere else in this build; the service role key
// bypasses RLS by design, which is exactly what's needed to write into a
// table nothing else (including the browser, via the anon key) can touch.
//
// Requires XERO_CLIENT_ID, XERO_CLIENT_SECRET, and SUPABASE_SERVICE_ROLE_KEY
// secrets set on this project. SUPABASE_SERVICE_ROLE_KEY is auto-generated
// for every Supabase project (Project Settings -> API) — no bank account
// or third-party approval needed for that one, only for the Xero app
// registration itself (see xero-oauth-connect/index.ts header).
//
// Registered in agent_functions for dashboard visibility/health tracking
// only (record_agent_run) — deliberately NO enabled-check, same reasoning
// as stripe-webhook: by the time Xero redirects here, the business owner
// has already approved the connection on Xero's own screen, so a kill
// switch could only ever strand a real, already-granted authorization
// half-completed. (Fixed 2026-09-23, Round 40 — this function existed
// with no agent_functions row at all, same bug class as the earlier
// registration-gap rounds.)
//
// Forged-callback fix (2026-09-25): this used to trust the `state` query
// param directly as the target business_id. Xero never validates `state`
// against anything — it's an opaque value the client sets when starting
// the flow and gets echoed back unchanged — so anyone who knew Minerva's
// client_id/redirect_uri (not secret) could run their OWN Xero login
// through this same callback with `state` set to any victim's
// business_id, attaching their own real Xero tokens to that victim's
// business. Fixed by requiring `state` to match an unexpired, unconsumed
// row in xero_oauth_states (see supabase_schema_delta_xero_oauth_state.sql
// and xero-oauth-connect, which is now the only place that ever creates
// one, only after verifying the caller owns the target business). The
// row is atomically deleted on lookup (claim-once) so a duplicated/
// replayed callback request can't reuse the same token twice. business_id
// is now taken ONLY from that row — never from a client-supplied param.
//
// Deploy with: supabase functions deploy xero-oauth-callback --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  // APP_URL (not VITE_APP_URL — that prefix is a frontend-only Vite
  // convention; this is a Deno edge function, and every other function
  // that needs the app's public URL, e.g. create-checkout-session,
  // send-quote-sms, reads plain APP_URL) — see ACCOUNT_SETUP_WALKTHROUGH.md.
  // (Fixed 2026-09-08 — this previously always fell back to the raw
  // Supabase project URL instead of the real app domain.)
  const appUrl = Deno.env.get('APP_URL') || supabaseUrl
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateToken = url.searchParams.get('state')
  const xeroError = url.searchParams.get('error')

  // Resolved below from xero_oauth_states — NEVER trust a business_id
  // supplied directly by the caller (see the forged-callback fix header
  // comment above).
  let businessId: string | null = null

  function redirectWithStatus(status: 'connected' | 'failed', detail?: string) {
    // Real route is /dispatch/:businessId (see src/App.jsx) — /dispatcher/
    // was a typo with no matching route, so this redirect previously landed
    // on a blank page after every Xero OAuth approval. (Fixed 2026-09-08.)
    const dest = new URL(`${appUrl}/dispatch/${businessId || ''}`)
    dest.searchParams.set('xero', status)
    if (detail) dest.searchParams.set('xero_detail', detail)
    supabase.rpc('record_agent_run', status === 'connected'
      ? { fn_name: 'xero-oauth-callback', status: 'ok' }
      : { fn_name: 'xero-oauth-callback', status: 'error', error_msg: detail || 'failed' }).then(() => {}, () => {})
    return new Response(null, { status: 302, headers: { 'Location': dest.toString(), 'Access-Control-Allow-Origin': '*' } })
  }

  if (!stateToken) return redirectWithStatus('failed', 'missing_state')

  // Atomically claim (delete-and-return) the pending state row — this is
  // the ONLY source of truth for which business this callback belongs to.
  // Consumed exactly once on the first request that presents this token,
  // regardless of whether the flow ultimately succeeds or fails below, so
  // a stale or replayed token can never be reused.
  const { data: claimedState, error: claimStateError } = await supabase
    .from('xero_oauth_states')
    .delete()
    .eq('state', stateToken)
    .select('business_id, expires_at')
    .maybeSingle()
  if (claimStateError) {
    console.error('xero-oauth-callback: state claim failed:', claimStateError.message)
    return redirectWithStatus('failed', 'state_lookup_error')
  }
  if (!claimedState || new Date(claimedState.expires_at) < new Date()) {
    return redirectWithStatus('failed', 'invalid_or_expired_state')
  }
  businessId = claimedState.business_id

  if (xeroError) return redirectWithStatus('failed', xeroError)
  if (!code) return redirectWithStatus('failed', 'missing_code')

  const clientId = Deno.env.get('XERO_CLIENT_ID')
  const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!clientId || !clientSecret || !serviceRoleKey) {
    return redirectWithStatus('failed', 'xero_not_configured')
  }

  try {
    const redirectUri = `${supabaseUrl}/functions/v1/xero-oauth-callback`

    const tokenRes = await fetch('https://identity.xero.com/connect/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    })
    if (!tokenRes.ok) return redirectWithStatus('failed', `token_exchange_${tokenRes.status}`)
    const tokens = await tokenRes.json()

    const connRes = await fetch('https://api.xero.com/connections', {
      headers: { 'Authorization': `Bearer ${tokens.access_token}` },
    })
    const connections = connRes.ok ? await connRes.json() : []
    const tenantId = connections?.[0]?.tenantId || null

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 1800) * 1000).toISOString()

    // Store whatever tokens we got either way — even without a tenant id,
    // the access/refresh tokens are still valid, so a business that hits
    // this can just retry connecting rather than losing the tokens outright.
    await supabase.from('integration_credentials').upsert({
      business_id: businessId,
      provider: 'xero',
      tenant_id: tenantId,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: expiresAt,
      connected_at: new Date().toISOString(),
    }, { onConflict: 'business_id,provider' })

    // Without a tenant id, xero-sync-invoice can never actually sync
    // anything (it explicitly requires cred.tenant_id) — don't tell the
    // business they're "connected" if syncing would immediately fail with
    // a confusing "not connected" error despite the UI saying otherwise.
    if (!tenantId) {
      return redirectWithStatus('failed', 'no_tenant_found')
    }

    await supabase.from('businesses').update({ xero_connected: true }).eq('id', businessId)

    return redirectWithStatus('connected')
  } catch (err) {
    console.error('xero-oauth-callback error:', err)
    return redirectWithStatus('failed', 'exception')
  }
})
