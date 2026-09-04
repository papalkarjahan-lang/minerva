// Supabase Edge Function: draft-quote
// Direct invocation: { businessId, description, clientName?, clientPhone?, leadId? }
// Quote-to-job AI estimator: a dispatcher (or technician) types a plain-
// English job description; this drafts a line-item quote by asking Claude
// to price it in line with this SAME business's own historical invoice
// line items (queried live, not a trained/shared model — one business's
// pricing never informs another's quote). Inserts a 'draft' row in
// `quotes` and returns it; nothing is sent to the client yet — that's a
// separate human-approved step (see send-quote-sms).
//
// Honest fallback: if ANTHROPIC_API_KEY isn't set, or the draft call fails,
// this still creates the quote row (status 'draft', ai_drafted: false) with
// a single blank line item pre-filled with the description, so the
// dispatcher can price it manually — it never blocks quote creation on AI
// being configured.
// Deploy with: supabase functions deploy draft-quote

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
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')

    const { businessId, description, clientName, clientPhone, leadId } = await req.json()
    if (!businessId || !description) throw new Error('businessId and description are required')

    // Minerva Max: ai_quotes is a paid add-on — defense in depth alongside
    // the frontend gate (DispatcherView's Quotes tab), in case this is ever
    // called directly. Mirrors src/maxAddons.js's hasAddon() logic.
    const { data: biz } = await supabase.from('businesses').select('max_addons, max_addon_trials').eq('id', businessId).maybeSingle()
    const addonActive = biz?.max_addons?.ai_quotes === true ||
      (biz?.max_addon_trials?.ai_quotes?.ends_at && new Date(biz.max_addon_trials.ai_quotes.ends_at).getTime() > Date.now())
    if (!addonActive) {
      return new Response(JSON.stringify({ error: 'AI Quote Drafting is a Minerva Max add-on — enable it from the MAX tab first.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    // This business's own recent pricing, for the AI to anchor against —
    // never another business's data.
    const { data: pastInvoices } = await supabase
      .from('invoices')
      .select('line_items')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(30)

    const priceHistory = (pastInvoices || [])
      .flatMap((inv: any) => Array.isArray(inv.line_items) ? inv.line_items : [])
      .filter((li: any) => li?.description && li?.amount)
      .slice(0, 60)

    let lineItems: { description: string; amount: number }[] = []
    let aiDrafted = false

    if (anthropicKey) {
      lineItems = await draftLineItems(anthropicKey, description, priceHistory)
      aiDrafted = lineItems.length > 0
    }

    if (lineItems.length === 0) {
      // Fallback: one blank line item so the dispatcher has something to edit
      // rather than an empty quote — never silently fails.
      lineItems = [{ description: description.slice(0, 120), amount: 0 }]
    }

    const subtotal = lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0)
    const gst = subtotal * 0.1
    const total = subtotal + gst

    const { data: quote, error } = await supabase.from('quotes').insert({
      business_id: businessId,
      lead_id: leadId || null,
      client_name: clientName || null,
      client_phone: clientPhone || null,
      description,
      line_items: lineItems,
      subtotal,
      gst,
      total,
      status: 'draft',
      ai_drafted: aiDrafted,
    }).select().single()
    if (error) throw error

    return new Response(JSON.stringify({ success: true, quote }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  } catch (err) {
    console.error('draft-quote error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})

// Asks Claude to draft 1-6 line items priced consistently with this
// business's own price history. Returns [] on any failure/parse issue so
// the caller falls back to a blank line item rather than risk inserting a
// wrongly-parsed number.
async function draftLineItems(
  apiKey: string,
  description: string,
  priceHistory: { description: string; amount: number }[]
): Promise<{ description: string; amount: number }[]> {
  try {
    const historyText = priceHistory.length > 0
      ? priceHistory.map(li => `- "${li.description}": $${Number(li.amount).toFixed(2)}`).join('\n')
      : '(no pricing history yet for this business — price conservatively using standard AU trade rates)'

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 500,
        messages: [{
          role: 'user',
          content: `You are drafting a quote for an Australian trade business (plumbing/electrical/HVAC/etc.) based on this job description: "${description}".

This business's own recent invoice line items and prices (use these to price consistently with how this specific business prices its work — do not invent unrelated pricing conventions):
${historyText}

Reply with ONLY a JSON array (no markdown, no prose) of 1-6 line items, each {"description": string, "amount": number}. Amounts are pre-GST, in AUD. Be conservative and realistic — this is a draft the business owner will review and edit before sending to the client.`,
        }],
      }),
    })

    if (!res.ok) return []
    const data = await res.json()
    const text: string = (data?.content?.[0]?.text || '').trim()
    const jsonMatch = text.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return []
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((li: any) => li?.description && typeof li.amount === 'number' && li.amount >= 0)
      .slice(0, 6)
      .map((li: any) => ({ description: String(li.description).slice(0, 200), amount: Number(li.amount) }))
  } catch (err) {
    console.error('draft-quote: AI draft failed', err)
    return []
  }
}
