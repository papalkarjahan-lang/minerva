// Supabase Edge Function: check-inventory-levels
// Autonomous agent, run daily via pg_cron. Supply & Inventory pillar —
// Minerva has no vendor accounts to actually place orders through, so this
// agent does the honest subset of "inventory automation" that's actually
// possible without fabricating a vendor integration: it watches stock levels
// entered by the business (via the Inventory tab) and Slack-alerts when an
// item drops to/below its reorder threshold, once per low-stock episode
// (won't re-alert every day while it stays low — only when it crosses back
// above and dips low again).
// Deploy with: supabase functions deploy check-inventory-levels

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { chunk } from "../_shared/batch.ts"

const INVENTORY_BATCH_SIZE = 20

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { data: fnState } = await supabase.from('agent_functions').select('enabled').eq('name', 'check-inventory-levels').maybeSingle()
    if (fnState?.enabled === false) {
      return new Response(JSON.stringify({ success: true, skipped: true, reason: 'disabled via agent_functions.enabled' }), { status: 200, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } })
    }

    const { data: items, error } = await supabase
      .from('inventory_items')
      .select('id, business_id, name, quantity, unit, reorder_threshold, supplier_name, low_stock_alert_sent_at')
    if (error) throw error

    let alerted = 0
    // Bounded-concurrency batching (added 2026-10-08) — inventory_items is
    // fetched with NO filter above (every item for every business on the
    // platform), so at hundreds of businesses this loop could run long
    // enough to risk the Edge Function wall-clock timeout partway through
    // — same pattern already fixed in reconcile-billing/daily-digest/etc,
    // see SCALE_READINESS_NOTES.md.
    for (const batch of chunk(items || [], INVENTORY_BATCH_SIZE)) {
      const results = await Promise.all(batch.map(item => checkOneItem(supabase, supabaseUrl, supabaseServiceKey, item)))
      for (const didAlert of results) if (didAlert) alerted++
    }

    supabase.rpc('record_agent_run', { fn_name: 'check-inventory-levels', status: 'ok' }).then(() => {}, () => {})

    return new Response(JSON.stringify({ success: true, checked: (items || []).length, alerted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('check-inventory-levels error:', err)
    try {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      createClient(supabaseUrl, supabaseServiceKey)
        .rpc('record_agent_run', { fn_name: 'check-inventory-levels', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Extracted from the main loop (2026-10-08) so it can be run through
// chunk()'s bounded-concurrency batching — same logic that was previously
// inline, unchanged. Returns whether a new low-stock alert was sent.
async function checkOneItem(
  supabase: ReturnType<typeof createClient>,
  supabaseUrl: string,
  supabaseServiceKey: string,
  item: any
): Promise<boolean> {
  const isLow = (item.quantity ?? 0) <= (item.reorder_threshold ?? 0)

  if (!isLow) {
    // Back above threshold — clear the flag so a future dip alerts again.
    if (item.low_stock_alert_sent_at) {
      await supabase.from('inventory_items').update({ low_stock_alert_sent_at: null }).eq('id', item.id)
    }
    return false
  }

  if (item.low_stock_alert_sent_at) return false // already alerted for this episode

  // Atomically claim this item before sending the Slack alert — same
  // time-of-check/time-of-use race chase-unpaid-invoices had (fixed
  // 2026-09-24): without this, an overlapping/duplicate run could see
  // the same not-yet-alerted item and send a duplicate low-stock
  // Slack alert for the same episode. This conditional update only
  // succeeds for whichever invocation gets there first.
  const { data: claimed, error: claimErr } = await supabase
    .from('inventory_items')
    .update({ low_stock_alert_sent_at: new Date().toISOString() })
    .eq('id', item.id)
    .is('low_stock_alert_sent_at', null)
    .select('id')
  if (claimErr) { console.error('check-inventory-levels: claim failed:', claimErr.message); return false }
  if (!claimed || claimed.length === 0) return false // already claimed by a concurrent run

  const supplierNote = item.supplier_name ? ` Usual supplier: ${item.supplier_name}.` : ''
  await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
    body: JSON.stringify({
      businessId: item.business_id,
      text: `📦 Low stock: *${item.name}* is at ${item.quantity} ${item.unit || 'units'} (reorder threshold ${item.reorder_threshold}).${supplierNote} Time to reorder.`,
    }),
  }).catch(() => {})

  return true
}
