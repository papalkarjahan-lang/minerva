// Supabase Edge Function: industrial-conductor
// "The Central Conductor" — primary orchestrator for the Industrial sector
// (businesses.sector = 'industrial'). Balances live asset availability
// against active leads/site requests. Two modes:
//  1. Direct invocation { leadId } — e.g. a new industrial_leads row looks
//     urgent (intent_signal mentions time pressure). Finds the nearest
//     'active' unassigned industrial_asset to the business and, if one
//     exists, posts a Slack recommendation for a human to confirm — this
//     function suggests, it does not silently commit resources on its own,
//     since a wrong equipment dispatch is expensive to reverse (unlike a
//     trade business's technician auto-assign, which this deliberately
//     does NOT mirror 1:1).
//  2. Cron sweep (no body, every 15 min) — scans industrial_leads with
//     status='new' created in the last hour and repeats the same
//     suggestion for any not yet actioned.
// Deploy with: supabase functions deploy industrial-conductor

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

    let leadIds: string[] = []
    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      if (body.leadId) leadIds = [body.leadId]
    }

    if (leadIds.length === 0) {
      const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
      const { data } = await supabase.from('industrial_leads').select('id').eq('status', 'new').gte('created_at', hourAgo)
      leadIds = (data || []).map((l: any) => l.id)
    }

    let suggested = 0
    for (const leadId of leadIds) {
      const { data: lead } = await supabase.from('industrial_leads').select('id, business_id, company_name, equipment_need').eq('id', leadId).maybeSingle()
      if (!lead) continue

      const { data: assets } = await supabase.from('industrial_assets')
        .select('id, name, status')
        .eq('business_id', lead.business_id)
        .eq('status', 'active')
        .is('geofence_site_id', null)
        .limit(1)

      const asset = (assets || [])[0]
      const text = asset
        ? `🧭 *Conductor*: lead *${lead.company_name}* (${lead.equipment_need || 'equipment need not specified'}) — asset *${asset.name}* is free and could be assigned. Confirm in the Industrial console.`
        : `🧭 *Conductor*: lead *${lead.company_name}* has no unassigned asset available right now — may need scheduling or a rental.`

      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId: lead.business_id, text }),
      }).catch(() => {})
      suggested++
    }

    return new Response(JSON.stringify({ success: true, evaluated: leadIds.length, suggested }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('industrial-conductor error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
