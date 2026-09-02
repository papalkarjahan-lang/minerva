// Supabase Edge Function: harvest-industrial-leads
// "Signal" — the lead-gathering half of the Lead Gathering & Intent domain.
//
// HONESTY NOTE: there is no real, accessible API for "scan public industrial
// registries / construction permit filings / intent networks" that Minerva
// can be wired to out of the box — those are paid third-party data products
// (e.g. a specific permit-data vendor or intent-data provider a business
// would need their own account/contract for). This function is the real,
// working ingestion side of that pipeline: it accepts a batch of leads
// (from a CSV export of such a registry, or manual entry) and inserts them
// as structured industrial_leads rows, ready for enrich-industrial-leads and
// industrial-conductor to act on. Point a real vendor's webhook or a
// scheduled CSV import job at this same endpoint later — the shape below is
// what it expects.
// Deploy with: supabase functions deploy harvest-industrial-leads

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

    const body = await req.json().catch(() => ({}))
    const { businessId, leads, source } = body
    if (!businessId || !Array.isArray(leads) || leads.length === 0) {
      return new Response(JSON.stringify({ error: 'businessId and a non-empty leads[] array are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const rows = leads
      .filter((l: any) => l.company_name)
      .map((l: any) => ({
        business_id: businessId,
        company_name: l.company_name,
        source: source || 'csv_import',
        intent_signal: l.intent_signal || null,
        equipment_need: l.equipment_need || null,
        estimated_size: l.estimated_size || null,
      }))

    const { data, error } = await supabase.from('industrial_leads').insert(rows).select('id')
    if (error) throw error

    await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
      body: JSON.stringify({ businessId, text: `📥 *Signal*: ${data?.length || 0} new industrial lead(s) imported.` }),
    }).catch(() => {})

    return new Response(JSON.stringify({ success: true, inserted: data?.length || 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('harvest-industrial-leads error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
