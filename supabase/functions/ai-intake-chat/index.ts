// Supabase Edge Function: ai-intake-chat
// Powers the AI Intake Assistant widget (/intake/:businessId). A prospective
// client chats with an AI that triages the job (emergency vs routine vs out
// of scope) and, once it has name/phone/suburb/description, captures a lead:
// writes a row to `leads` and SMSes the business's contact_phone so a human
// follows up. Deploy with: supabase functions deploy ai-intake-chat
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY     (server-side only — never exposed to the browser)
//   SUPABASE_URL          (auto-provided in Edge Function runtime)
//   SUPABASE_ANON_KEY     (auto-provided in Edge Function runtime)
//   TWILIO_ACCOUNT_SID    (same as other SMS functions; optional — lead
//   TWILIO_AUTH_TOKEN      capture still succeeds without SMS if unset)
//   TWILIO_PHONE_NUMBER

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ChatPayload {
  businessId: string
  messages: ChatMessage[]
}

const CLAUDE_MODEL = 'claude-opus-4-6'

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { businessId, messages }: ChatPayload = await req.json()
    if (!businessId || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing businessId or messages' }), { status: 400 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { data: business, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, trade_type, city, contact_phone')
      .eq('id', businessId)
      .single()
    if (bizErr || !business) {
      return new Response(JSON.stringify({ error: 'Business not found' }), { status: 404 })
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured in Supabase secrets')

    const systemPrompt = `You are the intake assistant for ${business.name}, a ${business.trade_type || 'trade'} business based in ${business.city || 'Australia'}.

Your job: chat with a prospective client, triage their request, and collect enough
information to hand a qualified lead to a human. Be warm, brief, and efficient —
this is a text chat widget, not a phone call. Ask one question at a time.

Classify urgency as you go:
- "emergency": active danger or damage (e.g. burst pipe, no power, gas smell, security breach)
- "routine": a normal job request (quote, install, scheduled service)
- "out_of_scope": not something ${business.trade_type || 'this business'} handles, or outside ${business.city || 'the service area'}

You need these fields before you can capture a lead: client_name, client_phone,
suburb, urgency, job_description. Do not invent or guess values — only fill a
field once the visitor has actually provided it.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{"reply": "<what to say to the visitor next>", "lead_captured": <true only on the
turn you have ALL five fields>, "lead": {"name": "", "phone": "", "suburb": "",
"urgency": "", "job_description": ""} or null if not yet captured}`

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 1024,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`)
    }

    const anthropicData = await anthropicRes.json()
    const textBlock = anthropicData.content?.find((b: { type: string }) => b.type === 'text')
    if (!textBlock) throw new Error('No text response from Claude')

    let parsed
    try {
      parsed = JSON.parse(textBlock.text)
    } catch {
      // Model didn't return clean JSON — fall back to showing the raw text
      // rather than failing the whole chat turn.
      parsed = { reply: textBlock.text, lead_captured: false, lead: null }
    }

    // On capture: persist the lead and notify the business, best-effort.
    if (parsed.lead_captured && parsed.lead) {
      const { name, phone, suburb, urgency, job_description } = parsed.lead
      await supabase.from('leads').insert({
        business_id: businessId,
        client_name: name,
        client_phone: phone,
        suburb,
        urgency,
        job_description,
        transcript: [...messages, { role: 'assistant', content: parsed.reply }],
      })

      const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
      const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
      const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
      if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM && business.contact_phone) {
        let toPhone = business.contact_phone.replace(/\s/g, '')
        if (toPhone.startsWith('0')) toPhone = '+61' + toPhone.slice(1)
        if (!toPhone.startsWith('+')) toPhone = '+61' + toPhone

        const urgencyTag = urgency === 'emergency' ? '🚨 EMERGENCY' : 'New lead'
        const smsBody = `${urgencyTag}: ${name}, ${phone}, ${suburb}. ${job_description}`.slice(0, 320)

        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: toPhone, From: TWILIO_FROM, Body: smsBody }).toString(),
        }).catch(err => console.error('ai-intake-chat: SMS notify failed', err))
      }
    }

    return new Response(JSON.stringify({ reply: parsed.reply, leadCaptured: !!parsed.lead_captured }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })

  } catch (err) {
    console.error('ai-intake-chat error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    })
  }
})
