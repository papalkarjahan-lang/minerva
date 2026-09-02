// Supabase Edge Function: track-consumables
// "The Quartermaster" — tracks on-site resource depletion (chemical
// volumes, replacement valves, welding wire, etc.). Cron sweep (every
// hour): flags any consumables_items row below its reorder_threshold that
// hasn't already been flagged, and marks reorder_requested_at so it's not
// re-alerted every run (mirrors the escalation_flagged_at pattern used
// elsewhere in Minerva). Clearing reorder_requested_at (e.g. after
// restocking) re-arms the alert for next time it drops low again.
// Deploy with: supabase functions deploy track-consumables

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

    const { data: lowItems, error: err2 } = await supabase
      .from('consumables_items')
      .select('id, business_id, site_id, name, quantity_on_hand, reorder_threshold, unit')
    if (err2) throw err2

    let flagged = 0
    for (const item of lowItems || []) {
      if (item.quantity_on_hand >= item.reorder_threshold) continue
      const { data: current } = await supabase.from('consumables_items').select('reorder_requested_at').eq('id', item.id).maybeSingle()
      if (current?.reorder_requested_at) continue // already flagged, waiting on restock

      await supabase.from('consumables_items').update({ reorder_requested_at: new Date().toISOString() }).eq('id', item.id)
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: item.business_id, text: `📦 *Quartermaster*: *${item.name}* is at ${item.quantity_on_hand}${item.unit} (below reorder threshold of ${item.reorder_threshold}${item.unit}) — approve a reorder.` }),
      }).catch(() => {})
      flagged++
    }

    return new Response(JSON.stringify({ success: true, evaluated: (lowItems || []).length, flagged }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('track-consumables error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
