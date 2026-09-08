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
// Deploy with: supabase functions deploy xero-oauth-callback --no-verify-jwt

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  // APP_URL (not VITE_APP_URL — that prefix is a frontend-only Vite
  // convention; this is a Deno edge function, and every other function
  // that needs the app's public URL, e.g. create-checkout-session,
  // send-quote-sms, reads plain APP_URL) — see ACCOUNT_SETUP_WALKTHROUGH.md.
  // (Fixed 2026-09-08 — this previously always fell back to the raw
  // Supabase project URL instead of the real app domain.)
  const appUrl = Deno.env.get('APP_URL') || supabaseUrl
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const businessId = url.searchParams.get('state')
  const xeroError = url.searchParams.get('error')

  function redirectWithStatus(status: 'connected' | 'failed', detail?: string) {
    // Real route is /dispatch/:businessId (see src/App.jsx) — /dispatcher/
    // was a typo with no matching route, so this redirect previously landed
    // on a blank page after every Xero OAuth approval. (Fixed 2026-09-08.)
    const dest = new URL(`${appUrl}/dispatch/${businessId || ''}`)
    dest.searchParams.set('xero', status)
    if (detail) dest.searchParams.set('xero_detail', detail)
    return new Response(null, { status: 302, headers: { 'Location': dest.toString(), 'Access-Control-Allow-Origin': '*' } })
  }

  if (xeroError) return redirectWithStatus('failed', xeroError)
  if (!code || !businessId) return redirectWithStatus('failed', 'missing_code_or_state')

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

    const supabase = createClient(supabaseUrl, serviceRoleKey)
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
