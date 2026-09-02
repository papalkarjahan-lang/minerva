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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: items, error } = await supabase
      .from('inventory_items')
      .select('id, business_id, name, quantity, unit, reorder_threshold, supplier_name, low_stock_alert_sent_at')
    if (error) throw error

    let alerted = 0
    for (const item of items || []) {
      const isLow = (item.quantity ?? 0) <= (item.reorder_threshold ?? 0)

      if (!isLow) {
        // Back above threshold — clear the flag so a future dip alerts again.
        if (item.low_stock_alert_sent_at) {
          await supabase.from('inventory_items').update({ low_stock_alert_sent_at: null }).eq('id', item.id)
        }
        continue
      }

      if (item.low_stock_alert_sent_at) continue // already alerted for this episode

      const supplierNote = item.supplier_name ? ` Usual supplier: ${item.supplier_name}.` : ''
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          businessId: item.business_id,
          text: `📦 Low stock: *${item.name}* is at ${item.quantity} ${item.unit || 'units'} (reorder threshold ${item.reorder_threshold}).${supplierNote} Time to reorder.`,
        }),
      }).catch(() => {})

      await supabase.from('inventory_items').update({ low_stock_alert_sent_at: new Date().toISOString() }).eq('id', item.id)
      alerted++
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
      const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
      createClient(supabaseUrl, supabaseAnonKey)
        .rpc('record_agent_run', { fn_name: 'check-inventory-levels', status: 'error', error_msg: err.message })
        .then(() => {}, () => {})
    } catch (_) { /* never let health tracking break the actual error response */ }
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
