// Supabase Edge Function: xero-sync-invoice
// Direct invocation only: { invoiceId }. Pushes one Minerva invoice to the
// connected Xero org as a real ACCREC (accounts receivable) draft invoice,
// via Xero's Accounting API. Real, working code — but only does anything
// once a business has actually completed the xero-oauth-connect flow (see
// that function's header for the two setup steps this build can't do on
// your behalf: registering the free Xero developer app, and setting the
// XERO_CLIENT_ID/XERO_CLIENT_SECRET/SUPABASE_SERVICE_ROLE_KEY secrets).
// Uses service_role (see xero-oauth-callback/index.ts header for why) to
// read the stored tokens from integration_credentials, refreshing them
// first if they've expired.
//
// Creates the invoice as a DRAFT in Xero, not AUTHORISED — a human should
// review it in Xero before it's sent to the client from there, since
// Minerva has no way to know what Xero chart-of-accounts code or contact
// record the business wants this mapped to beyond a best-effort guess.
// Deploy with: supabase functions deploy xero-sync-invoice
//
// Kill-switch/health wiring added 2026-09-23: this was never registered in
// agent_functions at all, despite being a financial-write function in the
// same category as sync-technician-billing (already registered/gated) —
// found via a directory-vs-agent_functions diff. See
// supabase_schema_delta_agent_registration_round2.sql for the new row.
//
// Ownership check added 2026-09-24 (Round 43): had verify_jwt:false and no
// check that the caller has any relationship to the business that owns
// invoiceId — meaning an unauthenticated stranger who knew/guessed an
// invoiceId could force-push that business's invoice to their connected
// Xero org. Fixed using the same isOwner pattern xero-oauth-connect already
// used for the identical forged-request risk.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { isAddonActive } from "../_shared/maxAddons.ts"
import { isOwnerOfBusiness, getAuthenticatedCaller } from "../_shared/ownership.ts"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const clientId = Deno.env.get('XERO_CLIENT_ID')
  const clientSecret = Deno.env.get('XERO_CLIENT_SECRET')
  if (!serviceRoleKey || !clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Xero integration not configured — see xero-oauth-connect/index.ts header.' }), {
      status: 501,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'xero-sync-invoice').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { invoiceId } = await req.json()
    if (!invoiceId) throw new Error('invoiceId is required')

    const { data: invoice, error: invErr } = await supabase.from('invoices').select('*, businesses(owner_user_id, contact_email, max_addons, max_addon_trials)').eq('id', invoiceId).maybeSingle()
    if (invErr || !invoice) throw new Error('invoice not found')

    const bizAddons = (invoice as any).businesses

    // Ownership check — see header note. A legitimate dispatcher's session
    // JWT is already attached automatically by supabase.functions.invoke(),
    // so this adds no friction for real usage.
    const caller = await getAuthenticatedCaller(req, supabase)
    if (!caller) {
      return new Response(JSON.stringify({ error: 'Not authenticated.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }
    if (!isOwnerOfBusiness(bizAddons, caller.id, caller.email)) {
      return new Response(JSON.stringify({ error: 'You do not have access to this business.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // Minerva Max: xero_sync is a paid add-on — defense in depth alongside
    // the frontend gate (see src/maxAddons.js / DispatcherView's Settings
    // Xero panel + "Sync to Xero" button).
    if (!isAddonActive(bizAddons, 'xero_sync')) {
      return new Response(JSON.stringify({ error: 'Xero Sync is a Minerva Max add-on — enable it from the MAX tab first.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data: cred, error: credErr } = await supabase.from('integration_credentials')
      .select('*').eq('business_id', invoice.business_id).eq('provider', 'xero').maybeSingle()
    if (credErr || !cred || !cred.tenant_id) {
      return new Response(JSON.stringify({ error: 'This business has not connected Xero yet.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    let accessToken = cred.access_token
    if (!cred.expires_at || new Date(cred.expires_at).getTime() < Date.now() + 60_000) {
      const refreshRes = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: cred.refresh_token }),
      })
      if (!refreshRes.ok) throw new Error(`Xero token refresh failed (HTTP ${refreshRes.status}) — business may need to reconnect Xero.`)
      const refreshed = await refreshRes.json()
      accessToken = refreshed.access_token
      await supabase.from('integration_credentials').update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token,
        expires_at: new Date(Date.now() + (refreshed.expires_in || 1800) * 1000).toISOString(),
      }).eq('id', cred.id)
    }

    const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : []
    const xeroInvoice = {
      Type: 'ACCREC',
      Contact: { Name: invoice.client_name || 'Client' },
      LineItems: lineItems.map((li: any) => ({
        Description: li.description,
        Quantity: 1,
        UnitAmount: li.amount,
        AccountCode: '200', // default Xero chart-of-accounts sales code — the business should
                             // remap this in Xero if they use a different code, see header note
      })),
      Status: 'DRAFT',
    }

    const xeroRes = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Xero-tenant-id': cred.tenant_id,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ Invoices: [xeroInvoice] }),
    })

    if (!xeroRes.ok) {
      const detail = await xeroRes.text().catch(() => '')
      throw new Error(`Xero API rejected the invoice (HTTP ${xeroRes.status}): ${detail.slice(0, 300)}`)
    }
    const xeroData = await xeroRes.json()
    const xeroInvoiceId = xeroData?.Invoices?.[0]?.InvoiceID || null

    await supabase.from('invoices').update({ xero_invoice_id: xeroInvoiceId }).eq('id', invoiceId)

    supabase.rpc('record_agent_run', { fn_name: 'xero-sync-invoice', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, xeroInvoiceId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('xero-sync-invoice error:', err)
    try {
      supabase.rpc('record_agent_run', { fn_name: 'xero-sync-invoice', status: 'error', error_msg: err.message }).then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
