// Supabase Edge Function: ai-intake-chat
// Powers the AI Intake Assistant widget (/intake/:businessId). A prospective
// client chats with an AI that triages the job (emergency vs routine vs out
// of scope) and, once it has name/phone/suburb/description, captures a lead:
// writes a row to `leads`, SMSes the business's contact_phone, and (if
// configured) posts to Slack via notify-slack, so a human follows up.
// Deploy with: supabase functions deploy ai-intake-chat
//
// Like every other Agent Operating System function, this now has a plain
// rules-based fallback (runTemplateIntake, below) that asks the same five
// fields in a fixed order and produces the same lead shape when
// ANTHROPIC_API_KEY is absent. The one real capability it gives up without
// the key: free-text triage and out-of-scope detection — the template path
// treats every conversation as in-scope and asks a direct urgency question
// instead of inferring it. See SALES_CLAIMS_ACCURACY_NOTE.md before calling
// this "AI" on a sales call while the key is unset — say "automatically."
//
// Required Supabase secrets:
//   ANTHROPIC_API_KEY     (server-side only — never exposed to the browser;
//                          optional — falls back to runTemplateIntake if unset)
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

interface IntakeResult {
  reply: string
  lead_captured: boolean
  lead: {
    name: string
    phone: string
    suburb: string
    urgency: string
    job_description: string
    score: number
    score_reason: string
    estimated_value_tier: string
    referral_code: string | null
  } | null
}

const CLAUDE_MODEL = 'claude-opus-4-6'

const EMERGENCY_KEYWORDS = [
  'emergency', 'urgent', 'asap', 'right now', 'burst', 'flooding', 'flood',
  'no power', 'no water', 'gas smell', 'gas leak', 'sparking', 'smoke',
  'leaking everywhere', 'locked out', "can't wait", 'cannot wait', 'now please',
]
const REFERRAL_CODE_PATTERN = /\b[A-Z0-9]{4,10}\b/
const HIGH_VALUE_KEYWORDS = ['renovation', 'renovate', 'install', 'installation', 'replace', 'full', 'whole', 'new system', 'rewire', 'regas']
const LOW_VALUE_KEYWORDS = ['quick', 'small', 'minor', 'quote only', 'just a', 'tap', 'leaky tap']

// Deterministic, non-AI intake flow used whenever ANTHROPIC_API_KEY isn't
// configured. Walks the same five required fields in a fixed order:
// job_description -> urgency -> name -> phone -> suburb. Every question is
// a plain string, not model-generated, and every judgement call below is a
// simple keyword/heuristic check rather than free-text understanding — this
// is deliberately narrower than the Claude path, not a hidden re-implementation
// of it. Scoring and lead persistence downstream treat both paths identically.
function runTemplateIntake(business: { name: string; trade_type?: string | null; city?: string | null }, messages: ChatMessage[]): IntakeResult {
  // Only real user turns count as answers — the widget's static greeting
  // (if present as a leading assistant message) isn't an answer to anything.
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content.trim()).filter(Boolean)
  const answered = userMessages.length

  // Opportunistic referral code scan across every user message (same rule
  // as the Claude path: never asked for, only captured if volunteered).
  let referralCode: string | null = null
  for (const msg of userMessages) {
    if (/referr|mate said|friend said|code/i.test(msg)) {
      const match = msg.toUpperCase().match(REFERRAL_CODE_PATTERN)
      if (match) { referralCode = match[0]; break }
    }
  }

  const bizName = business.name

  if (answered === 0) {
    return { reply: `Thanks for reaching out to ${bizName}! What can we help you with today?`, lead_captured: false, lead: null }
  }

  const jobDescription = userMessages[0]

  if (answered === 1) {
    return {
      reply: `Got it. Is this urgent right now (e.g. active leak, no power, safety issue) or can it wait for a normal scheduled visit?`,
      lead_captured: false,
      lead: null,
    }
  }

  const urgencyAnswer = userMessages[1].toLowerCase()
  const isEmergency = EMERGENCY_KEYWORDS.some(kw => urgencyAnswer.includes(kw)) || /\burgent\b|\bemergency\b/.test(urgencyAnswer)
  const urgency = isEmergency ? 'emergency' : 'routine'

  if (answered === 2) {
    return { reply: `Understood. Can I grab your name?`, lead_captured: false, lead: null }
  }

  const name = userMessages[2]

  if (answered === 3) {
    return { reply: `Thanks ${name.split(' ')[0] || name}. What's the best phone number to reach you on?`, lead_captured: false, lead: null }
  }

  const phone = userMessages[3].replace(/[^\d+ ]/g, '').trim()

  if (answered === 4) {
    return { reply: `And which suburb are you in?`, lead_captured: false, lead: null }
  }

  const suburb = userMessages[4]

  // Fifth answer received: all five fields present, capture the lead.
  const combinedText = `${jobDescription} ${urgencyAnswer}`.toLowerCase()
  const isHighValue = HIGH_VALUE_KEYWORDS.some(kw => combinedText.includes(kw))
  const isLowValue = !isHighValue && LOW_VALUE_KEYWORDS.some(kw => combinedText.includes(kw))
  const estimatedValueTier = isHighValue ? 'high' : isLowValue ? 'low' : 'medium'

  let score = isEmergency ? 75 : 50
  if (jobDescription.length > 60) score += 10
  if (isHighValue) score += 10
  score = Math.max(0, Math.min(100, score))
  const scoreReason = `Template intake: ${urgency}${isHighValue ? ', high-value keywords in description' : ''}.`

  return {
    reply: `Thanks ${name.split(' ')[0] || name} — that's everything I need. Someone from ${bizName} will be in touch shortly${isEmergency ? ', treating this as urgent' : ''}.`,
    lead_captured: true,
    lead: {
      name,
      phone,
      suburb,
      urgency,
      job_description: jobDescription,
      score,
      score_reason: scoreReason,
      estimated_value_tier: estimatedValueTier,
      referral_code: referralCode,
    },
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } })
  }

  try {
    const { businessId, messages }: ChatPayload = await req.json()
    if (!businessId || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing businessId or messages' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
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
      return new Response(JSON.stringify({ error: 'Business not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      })
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

    let parsed: IntakeResult

    if (!ANTHROPIC_API_KEY) {
      parsed = runTemplateIntake(business, messages)
    } else {

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

If — and only if — the visitor volunteers that a friend/past client referred
them and gives you a short code (e.g. "my mate said to use code AB12CD"),
capture it in a referral_code field. Never ask for a referral code
proactively — this is opportunistic capture only, not a required or
prompted field.

Do NOT capture a lead for "out_of_scope" requests — just tell the visitor
honestly that this isn't something ${business.name} handles (or that they're
outside the service area), and suggest they search for the right kind of
business. lead_captured must stay false for those conversations.

Once you have all five fields for an emergency or routine request, also score
the lead 0-100 based ONLY on what's in this conversation — how urgent it is,
how specific/detailed the job description is, and how well-defined the scope
sounds. Higher = more urgent and more clearly a real, ready-to-book job. Give
a one-sentence score_reason. Also give estimated_value_tier as "low", "medium",
or "high" based on the apparent scope of the job described (e.g. "leaky tap" is
low, "full bathroom renovation" is high) — this is a rough signal from the
conversation, not a real valuation.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{"reply": "<what to say to the visitor next>", "lead_captured": <true only on the
turn you have ALL five fields AND urgency is not out_of_scope>, "lead": {"name": "",
"phone": "", "suburb": "", "urgency": "", "job_description": "", "score": 0,
"score_reason": "", "estimated_value_tier": "", "referral_code": "" or null} or null
if not yet captured}`

    // The widget's first message is a static assistant greeting rendered
    // client-side (not something Claude said), so it isn't part of the real
    // turn history. The Anthropic API requires the message list to start
    // with a 'user' turn — trim any leading assistant message(s) before
    // sending, or the request errors out on every very first exchange.
    let apiMessages = messages
    while (apiMessages.length && apiMessages[0].role !== 'user') {
      apiMessages = apiMessages.slice(1)
    }

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
        messages: apiMessages.map(m => ({ role: m.role, content: m.content })),
      }),
    })

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text()
      throw new Error(`Anthropic API error ${anthropicRes.status}: ${errText}`)
    }

    const anthropicData = await anthropicRes.json()
    const textBlock = anthropicData.content?.find((b: { type: string }) => b.type === 'text')
    if (!textBlock) throw new Error('No text response from Claude')

    try {
      parsed = JSON.parse(textBlock.text)
    } catch {
      // Model didn't return clean JSON — fall back to showing the raw text
      // rather than failing the whole chat turn.
      parsed = { reply: textBlock.text, lead_captured: false, lead: null }
    }

    } // end of Claude (ANTHROPIC_API_KEY present) branch

    // On capture: persist the lead and notify the business, best-effort.
    if (parsed.lead_captured && parsed.lead) {
      const { name, phone, suburb, urgency, job_description } = parsed.lead
      let score = Math.max(0, Math.min(100, Number(parsed.lead.score) || 0))
      let scoreReason = parsed.lead.score_reason || ''

      // Duplicate/repeat-client detection: has this phone number contacted
      // this business before, either as a prior lead or a real job? A known
      // client is a warmer lead than a stranger, so it earns a deterministic
      // boost on top of the content-based score (not re-guessed by the model).
      let isRepeatClient = false
      if (phone) {
        const [{ count: priorLeads }, { count: priorJobs }] = await Promise.all([
          supabase.from('leads').select('id', { count: 'exact', head: true })
            .eq('business_id', businessId).eq('client_phone', phone),
          supabase.from('jobs').select('id', { count: 'exact', head: true })
            .eq('business_id', businessId).eq('client_phone', phone),
        ])
        isRepeatClient = (priorLeads ?? 0) > 0 || (priorJobs ?? 0) > 0
        if (isRepeatClient) {
          score = Math.min(100, score + 15)
          scoreReason = scoreReason ? `${scoreReason} Returning client (+15).` : 'Returning client.'
        }
      }

      // Referral code (opportunistic, see system prompt): only trust it if
      // it actually matches a real invoices.referral_code for THIS
      // business — an unmatched/garbled code the visitor mistyped is just
      // dropped rather than stored as unverified data.
      let referredByCode: string | null = null
      const rawCode = (parsed.lead.referral_code || '').toString().trim().toUpperCase()
      if (rawCode) {
        const { data: matchedInvoice } = await supabase
          .from('invoices')
          .select('id')
          .eq('business_id', businessId)
          .eq('referral_code', rawCode)
          .limit(1)
          .maybeSingle()
        if (matchedInvoice) referredByCode = rawCode
      }

      await supabase.from('leads').insert({
        business_id: businessId,
        client_name: name,
        client_phone: phone,
        suburb,
        urgency,
        job_description,
        score,
        score_reason: scoreReason,
        estimated_value_tier: parsed.lead.estimated_value_tier || null,
        is_repeat_client: isRepeatClient,
        transcript: [...messages, { role: 'assistant', content: parsed.reply }],
        ...(referredByCode ? { referred_by_code: referredByCode, source: 'referral' } : {}),
      })

      // Custom Workflows: fire the 'lead.created' trigger for this business, if any are configured.
      fetch(`${supabaseUrl}/functions/v1/run-custom-workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ businessId, event: 'lead.created', payload: { urgency, estimated_value_tier: parsed.lead.estimated_value_tier || null } }),
      }).catch(() => {})

      const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
      const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
      const TWILIO_FROM = Deno.env.get('TWILIO_PHONE_NUMBER')
      if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM && business.contact_phone) {
        let toPhone = business.contact_phone.replace(/\s/g, '')
        if (toPhone.startsWith('0')) toPhone = '+61' + toPhone.slice(1)
        if (!toPhone.startsWith('+')) toPhone = '+61' + toPhone

        const urgencyTag = urgency === 'emergency' ? '🚨 EMERGENCY' : 'New lead'
        const repeatTag = isRepeatClient ? ' (returning client)' : ''
        const smsBody = `${urgencyTag} · score ${score}${repeatTag}: ${name}, ${phone}, ${suburb}. ${job_description}`.slice(0, 320)

        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: toPhone, From: TWILIO_FROM, Body: smsBody }).toString(),
        }).catch(err => console.error('ai-intake-chat: SMS notify failed', err))
      }

      const urgencyTag2 = urgency === 'emergency' ? '🚨 EMERGENCY' : 'New lead'
      const repeatTag2 = isRepeatClient ? ' (returning client)' : ''
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({
          businessId,
          text: `${urgencyTag2} · score ${score}${repeatTag2}: *${name}*, ${phone}, ${suburb}. ${job_description}`,
        }),
      }).catch(err => console.error('ai-intake-chat: Slack notify failed', err))
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
