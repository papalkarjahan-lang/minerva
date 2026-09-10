// Supabase Edge Function: parse-prospect-text
// Solves the "compiling a clean CSV by hand is slow" friction one step
// earlier than draft-outreach-batch: accepts messy, unstructured pasted
// text (e.g. copied straight off a business directory listing page, a
// Google Maps business panel, a LinkedIn company list export, or a trade
// association member page you're manually browsing) and asks Claude to
// extract structured prospect rows from it.
//
// HONESTY NOTE, same discipline as harvest-industrial-leads: this does
// NOT scrape anything itself — there is no background fetching of any
// website. The operator does the actual browsing/copying by hand (which
// is legal — copying publicly visible text you're looking at in your own
// browser is not "scraping" in the ToS-violation sense; an automated
// scraper hitting Google Maps or LinkedIn's servers directly would be).
// This function only restructures text that's already been pasted in.
//
// Direct invocation: { text: string } — inserts extracted rows into
// outreach_prospects at status='new', ready for draft-outreach-batch.
// Deploy with: supabase functions deploy parse-prospect-text

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const { text } = await req.json()
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'text is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    if (!anthropicKey) {
      return new Response(JSON.stringify({ error: 'ANTHROPIC_API_KEY not configured — use the CSV paste box instead until this is set' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const rows = await extractProspects(anthropicKey, text)
    if (rows.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, note: 'No extractable business contacts found in the pasted text.' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const { data, error } = await supabase.from('outreach_prospects').insert(
      rows.map(r => ({ ...r, source: 'pasted_text' }))
    ).select('id')
    if (error) throw error

    return new Response(JSON.stringify({ success: true, inserted: data?.length || 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('parse-prospect-text error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

async function extractProspects(apiKey: string, text: string): Promise<Array<{ company_name: string; contact_name: string | null; contact_email: string | null; contact_phone: string | null; trade_type: string | null; city: string | null }>> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: `Extract every distinct business contact from this pasted text (a business directory listing, LinkedIn export, or similar). For each, output company_name, contact_name (or null), contact_email (or null), contact_phone (or null), trade_type (best guess: plumbing/electrical/hvac/multi-location/facilities-management/industrial/other, or null if unclear), city (or null). Skip anything that isn't clearly a business contact. Reply with ONLY a JSON array, no markdown, no prose:

${text.slice(0, 8000)}`,
        }],
      }),
    })
    if (!res.ok) return []
    const data = await res.json()
    const responseText: string = (data?.content?.[0]?.text || '').trim()
    const jsonMatch = responseText.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((r: any) => r?.company_name)
      .slice(0, 100)
      .map((r: any) => ({
        company_name: String(r.company_name).slice(0, 200),
        contact_name: r.contact_name ? String(r.contact_name).slice(0, 200) : null,
        contact_email: r.contact_email ? String(r.contact_email).slice(0, 200) : null,
        contact_phone: r.contact_phone ? String(r.contact_phone).slice(0, 50) : null,
        trade_type: r.trade_type ? String(r.trade_type).slice(0, 50) : null,
        city: r.city ? String(r.city).slice(0, 100) : null,
      }))
  } catch (err) {
    console.error('parse-prospect-text: extraction failed', err)
    return []
  }
}
