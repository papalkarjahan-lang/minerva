// Supabase Edge Function: voice-intake-agent
// The AI phone receptionist — closes the #1 gap named in the "AI Business
// OS" description: a caller should be able to describe their job over the
// phone and have it booked as a lead automatically, the same way the
// text-chat widget (ai-intake-chat) already works. Set this as a business's
// "A CALL COMES IN" (Voice) webhook in the Twilio Console INSTEAD OF
// missed-call-webhook if they want a real conversational phone agent
// rather than the static "we missed you, here's a text" message.
// missed-call-webhook is untouched and remains the default/simpler path —
// this is opt-in, not a replacement of existing behaviour for businesses
// already using it.
//
// HONESTY NOTE: like every other AI feature in this codebase, this is a
// real capability, not a mockup — but it depends on a live Twilio phone
// number that has completed Twilio's own phone/identity verification,
// which is a pre-existing account-level blocker unrelated to this code.
// The function is safe to deploy now and will simply never receive a call
// until that's done. See SALES_CLAIMS_ACCURACY_NOTE.md before describing
// this as "AI-powered" on a sales call while ANTHROPIC_API_KEY is unset —
// the template fallback below is real but not free-text understanding.
//
// Deploy with: supabase functions deploy voice-intake-agent --no-verify-jwt
// (must be reachable by Twilio without a Supabase auth header, same as
// missed-call-webhook/stripe-webhook)
//
// Required Supabase secrets:
//   TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_PHONE_NUMBER (existing)
//   SUPABASE_SERVICE_ROLE_KEY (existing pattern — this reads
//     businesses.twilio_number and voice_call_sessions, neither of which
//     has an anon policy; same admin-client pattern as missed-call-webhook)
//   ANTHROPIC_API_KEY (optional — falls back to a deterministic scripted
//     phone flow, same "safe no-op until secret is set" pattern as
//     ai-intake-chat's runTemplateIntake, if unset)
//
// Flow (Twilio <Gather input="speech"> round-trips):
// 1. Call comes in (no SpeechResult yet) -> create a voice_call_sessions
//    row keyed by CallSid, ask the opening question via <Gather>.
// 2. Every subsequent POST includes the caller's transcribed speech
//    (Twilio's own speech-to-text, not something this function does) ->
//    append it to the session's message history, get the next
//    question/reply (Claude or template), respond with another <Gather>
//    until all fields are captured.
// 3. On capture: speak a closing line, hang up, and persist the lead using
//    the exact same insert + business-SMS + Slack-notify + custom-workflow
//    trigger pattern ai-intake-chat already uses, so leads created by
//    phone show up identically to leads created by the text widget.
// 4. If the caller hangs up before finishing, or Twilio's speech
//    recognition times out twice in a row, send the same "sorry we missed
//    part of that — here's our booking link" SMS fallback
//    missed-call-webhook already sends, so an incomplete call is never a
//    dead end.
//
// Twilio's request-validation (X-Twilio-Signature, HMAC-SHA1) is checked
// on every request, mirroring missed-call-webhook — see that function's
// comment for the algorithm reference.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

const CLAUDE_MODEL = 'claude-opus-4-6'
const MAX_NO_INPUT_RETRIES = 1 // one re-prompt on silence/no-speech before giving up and texting a fallback link

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface IntakeResult {
  reply: string
  lead_captured: boolean
  lead: {
    name: string
    urgency: string
    job_description: string
    suburb: string
    score: number
    score_reason: string
    estimated_value_tier: string
  } | null
}

const EMERGENCY_KEYWORDS = [
  'emergency', 'urgent', 'asap', 'right now', 'burst', 'flooding', 'flood',
  'no power', 'no water', 'gas smell', 'gas leak', 'sparking', 'smoke',
  'leaking everywhere', 'locked out', "can't wait", 'cannot wait', 'now please',
]
const HIGH_VALUE_KEYWORDS = ['renovation', 'renovate', 'install', 'installation', 'replace', 'full', 'whole', 'new system', 'rewire', 'regas']
const LOW_VALUE_KEYWORDS = ['quick', 'small', 'minor', 'quote only', 'just a', 'tap', 'leaky tap']

function escapeXml(str: string) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

// Same Twilio request-signing algorithm as missed-call-webhook.
// https://www.twilio.com/docs/usage/security#validating-requests
async function isValidTwilioSignature(req: Request, form: FormData): Promise<boolean> {
  const authToken = Deno.env.get('TWILIO_AUTH_TOKEN')
  const twilioSignature = req.headers.get('X-Twilio-Signature')
  if (!authToken || !twilioSignature) return false

  const sortedKeys = [...form.keys()].sort()
  let data = req.url
  for (const key of sortedKeys) {
    data += key + (form.get(key)?.toString() ?? '')
  }

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(data))
  const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
  return computedSignature === twilioSignature
}

// Deterministic, non-AI phone flow used whenever ANTHROPIC_API_KEY isn't
// configured. Only 4 fields (name, urgency, suburb, job_description) since
// the caller's phone number is already known from Caller ID — one field
// shorter than ai-intake-chat's text version, which has no equivalent of
// caller ID. Every question is a plain string, every judgement a simple
// keyword check — same honesty boundary as ai-intake-chat's template path.
function runTemplateVoiceIntake(business: { name: string }, userTurns: string[]): IntakeResult {
  const bizName = business.name
  const answered = userTurns.length

  if (answered === 0) {
    return { reply: `Thanks for calling ${bizName}. What can we help you with today?`, lead_captured: false, lead: null }
  }

  const jobDescription = userTurns[0]

  if (answered === 1) {
    return { reply: `Got it. Is this urgent right now, like an active leak or a safety issue, or can it wait for a normal booking?`, lead_captured: false, lead: null }
  }

  const urgencyAnswer = userTurns[1].toLowerCase()
  const isEmergency = EMERGENCY_KEYWORDS.some(kw => urgencyAnswer.includes(kw)) || /\burgent\b|\bemergency\b/.test(urgencyAnswer)
  const urgency = isEmergency ? 'emergency' : 'routine'

  if (answered === 2) {
    return { reply: `Understood. Can I grab your name?`, lead_captured: false, lead: null }
  }

  const name = userTurns[2]

  if (answered === 3) {
    return { reply: `Thanks ${name.split(' ')[0] || name}. And which suburb are you in?`, lead_captured: false, lead: null }
  }

  const suburb = userTurns[3]

  const combinedText = `${jobDescription} ${urgencyAnswer}`.toLowerCase()
  const isHighValue = HIGH_VALUE_KEYWORDS.some(kw => combinedText.includes(kw))
  const isLowValue = !isHighValue && LOW_VALUE_KEYWORDS.some(kw => combinedText.includes(kw))
  const estimatedValueTier = isHighValue ? 'high' : isLowValue ? 'low' : 'medium'

  let score = isEmergency ? 75 : 50
  if (jobDescription.length > 40) score += 10
  if (isHighValue) score += 10
  score = Math.max(0, Math.min(100, score))

  return {
    reply: `Thanks ${name.split(' ')[0] || name} — that's everything I need. Someone from ${bizName} will be in touch shortly${isEmergency ? ', treating this as urgent' : ''}. Have a good day.`,
    lead_captured: true,
    lead: {
      name, urgency, job_description: jobDescription, suburb,
      score, score_reason: `Template voice intake: ${urgency}${isHighValue ? ', high-value keywords' : ''}.`,
      estimated_value_tier: estimatedValueTier,
    },
  }
}

async function getClaudeReply(
  apiKey: string,
  business: { name: string; trade_type?: string | null; city?: string | null },
  messages: ChatMessage[]
): Promise<IntakeResult> {
  const systemPrompt = `You are the phone receptionist for ${business.name}, a ${business.trade_type || 'trade'} business based in ${business.city || 'Australia'}. You are on a live phone call — the caller can only hear you, so keep every reply to one or two short spoken sentences, no lists, no markdown.

Your job: triage the caller's request and collect enough information to hand a qualified lead to a human. Ask one question at a time. The caller's phone number is already known from Caller ID, so never ask for it.

Classify urgency as you go:
- "emergency": active danger or damage (e.g. burst pipe, no power, gas smell, security breach)
- "routine": a normal job request (quote, install, scheduled service)
- "out_of_scope": not something ${business.trade_type || 'this business'} handles, or outside ${business.city || 'the service area'}

You need these fields before you can capture a lead: name, suburb, urgency, job_description. Do not invent or guess values — only fill a field once the caller has actually said it.

Do NOT capture a lead for "out_of_scope" requests — just tell the caller honestly this isn't something ${business.name} handles (or that they're outside the service area). lead_captured must stay false for those calls.

Once you have all four fields for an emergency or routine request, score the lead 0-100 based only on this conversation (urgency + specificity), give a one-sentence score_reason, and estimated_value_tier as "low"/"medium"/"high" based on apparent job scope.

Respond with ONLY a JSON object, no markdown fences, matching exactly this shape:
{"reply": "<what to say next, 1-2 short sentences>", "lead_captured": <true only once all four fields are known AND urgency is not out_of_scope>, "lead": {"name": "", "urgency": "", "job_description": "", "suburb": "", "score": 0, "score_reason": "", "estimated_value_tier": ""} or null if not yet captured}`

  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: 400,
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

  try {
    return JSON.parse(textBlock.text)
  } catch {
    return { reply: textBlock.text, lead_captured: false, lead: null }
  }
}

// Sends the same "sorry we missed part of that" SMS fallback
// missed-call-webhook already sends for a fully-missed call, reused here
// for a call that started but never finished (hangup or repeated silence).
async function sendFallbackSms(toPhone: string, fromPhone: string, businessName: string) {
  const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
  const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
  if (!TWILIO_SID || !TWILIO_TOKEN) return
  try {
    const message = `Sorry we got cut off! Reply here or call ${businessName} back and we'll help book your job.`
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: toPhone, From: fromPhone, Body: message }).toString(),
    })
  } catch (err) {
    console.error('voice-intake-agent: fallback SMS failed', err)
  }
}

function gatherTwiml(prompt: string, noInputRetries: number): string {
  // action carries noInputRetries forward via query string so a
  // no-speech timeout can be told apart from a genuine short answer
  // without needing another DB round-trip just to check a counter.
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="?retries=${noInputRetries}" method="POST" speechTimeout="auto" timeout="6">
    <Say voice="Polly.Nicole">${escapeXml(prompt)}</Say>
  </Gather>
  <Say voice="Polly.Nicole">Sorry, I didn't catch that.</Say>
  <Redirect method="POST">?retries=${noInputRetries + 1}</Redirect>
</Response>`
}

function sayAndHangupTwiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Nicole">${escapeXml(message)}</Say>
  <Hangup/>
</Response>`
}

serve(async (req: Request) => {
  try {
    const url = new URL(req.url)
    const noInputRetries = Number(url.searchParams.get('retries') || '0')
    const form = await req.formData()

    if (!(await isValidTwilioSignature(req, form))) {
      console.error('voice-intake-agent: invalid or missing X-Twilio-Signature — rejecting request')
      return new Response('Invalid signature', { status: 403 })
    }

    const callSid = form.get('CallSid')?.toString()
    const from = form.get('From')?.toString()
    const to = form.get('To')?.toString()
    const speechResult = form.get('SpeechResult')?.toString()?.trim()

    if (!callSid) throw new Error('Missing CallSid')

    let businessId: string | null = null
    let business: { id: string; name: string; trade_type?: string | null; city?: string | null; contact_phone?: string | null } | null = null
    if (to) {
      const { data: biz } = await supabaseAdmin
        .from('businesses')
        .select('id, name, trade_type, city, contact_phone')
        .eq('twilio_number', to)
        .maybeSingle()
      business = biz
      businessId = biz?.id || null
    }
    const businessName = business?.name || 'us'

    // No speech captured this round (first-ever call, or a timeout) — if
    // we've already retried once, give up gracefully rather than looping
    // the caller forever.
    if (!speechResult) {
      if (noInputRetries > MAX_NO_INPUT_RETRIES) {
        if (from && to) await sendFallbackSms(from, to, businessName)
        return new Response(sayAndHangupTwiml(`Sorry, I'm having trouble hearing you. We'll text you a link to book instead.`), {
          status: 200, headers: { 'Content-Type': 'text/xml' },
        })
      }
      // Brand-new call: create the session row now so every later turn has
      // something to append to.
      if (noInputRetries === 0) {
        await supabaseAdmin.from('voice_call_sessions').upsert({
          business_id: businessId, call_sid: callSid, from_phone: from || null, messages: [],
        }, { onConflict: 'call_sid' })
      }
      const opening = `Thanks for calling ${businessName}. What can we help you with today?`
      return new Response(gatherTwiml(opening, noInputRetries), {
        status: 200, headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Load (or, defensively, create) this call's running transcript.
    const { data: session } = await supabaseAdmin
      .from('voice_call_sessions')
      .select('*')
      .eq('call_sid', callSid)
      .maybeSingle()

    const priorMessages: ChatMessage[] = (session?.messages as ChatMessage[]) || []
    const messages: ChatMessage[] = [...priorMessages, { role: 'user', content: speechResult }]
    const userTurns = messages.filter(m => m.role === 'user').map(m => m.content)

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    let parsed: IntakeResult
    if (ANTHROPIC_API_KEY && business) {
      try {
        parsed = await getClaudeReply(ANTHROPIC_API_KEY, business, messages)
      } catch (err) {
        console.error('voice-intake-agent: Claude call failed, falling back to template', err)
        parsed = runTemplateVoiceIntake({ name: businessName }, userTurns)
      }
    } else {
      parsed = runTemplateVoiceIntake({ name: businessName }, userTurns)
    }

    const updatedMessages: ChatMessage[] = [...messages, { role: 'assistant', content: parsed.reply }]
    await supabaseAdmin.from('voice_call_sessions').update({
      messages: updatedMessages,
      lead_captured: !!parsed.lead_captured,
      updated_at: new Date().toISOString(),
    }).eq('call_sid', callSid)

    if (!parsed.lead_captured || !parsed.lead) {
      return new Response(gatherTwiml(parsed.reply, 0), {
        status: 200, headers: { 'Content-Type': 'text/xml' },
      })
    }

    // Captured — persist the lead using the same shape/side-effects as
    // ai-intake-chat, so phone-sourced leads look identical to text-widget
    // leads everywhere else in the app.
    if (businessId && business) {
      const { name, urgency, job_description, suburb } = parsed.lead
      let score = Math.max(0, Math.min(100, Number(parsed.lead.score) || 0))
      let scoreReason = parsed.lead.score_reason || ''
      const phone = from || null

      let isRepeatClient = false
      if (phone) {
        const [{ count: priorLeads }, { count: priorJobs }] = await Promise.all([
          supabaseAdmin.from('leads').select('id', { count: 'exact', head: true })
            .eq('business_id', businessId).eq('client_phone', phone),
          supabaseAdmin.from('jobs').select('id', { count: 'exact', head: true })
            .eq('business_id', businessId).eq('client_phone', phone),
        ])
        isRepeatClient = (priorLeads ?? 0) > 0 || (priorJobs ?? 0) > 0
        if (isRepeatClient) {
          score = Math.min(100, score + 15)
          scoreReason = scoreReason ? `${scoreReason} Returning client (+15).` : 'Returning client.'
        }
      }

      await supabaseAdmin.from('leads').insert({
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
        transcript: updatedMessages,
        source: 'voice_intake_agent',
      })

      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

      fetch(`${supabaseUrl}/functions/v1/run-custom-workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({ businessId, event: 'lead.created', payload: { urgency, estimated_value_tier: parsed.lead.estimated_value_tier || null } }),
      }).catch(() => {})

      const TWILIO_SID = Deno.env.get('TWILIO_ACCOUNT_SID')
      const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN')
      const TWILIO_FROM = to || Deno.env.get('TWILIO_PHONE_NUMBER')
      if (TWILIO_SID && TWILIO_TOKEN && TWILIO_FROM && business.contact_phone) {
        let toBizPhone = business.contact_phone.replace(/\s/g, '')
        if (toBizPhone.startsWith('0')) toBizPhone = '+61' + toBizPhone.slice(1)
        if (!toBizPhone.startsWith('+')) toBizPhone = '+61' + toBizPhone

        const urgencyTag = urgency === 'emergency' ? '🚨 EMERGENCY' : 'New lead'
        const repeatTag = isRepeatClient ? ' (returning client)' : ''
        const smsBody = `${urgencyTag} · score ${score}${repeatTag} (phone): ${name}, ${phone || 'no number'}, ${suburb}. ${job_description}`.slice(0, 320)

        await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({ To: toBizPhone, From: TWILIO_FROM, Body: smsBody }).toString(),
        }).catch(err => console.error('voice-intake-agent: SMS notify failed', err))
      }

      const urgencyTag2 = urgency === 'emergency' ? '🚨 EMERGENCY' : 'New lead'
      const repeatTag2 = isRepeatClient ? ' (returning client)' : ''
      await fetch(`${supabaseUrl}/functions/v1/notify-slack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseServiceKey}` },
        body: JSON.stringify({
          businessId,
          text: `${urgencyTag2} · score ${score}${repeatTag2} (phone): *${name}*, ${phone || 'no number'}, ${suburb}. ${job_description}`,
        }),
      }).catch(err => console.error('voice-intake-agent: Slack notify failed', err))
    }

    return new Response(sayAndHangupTwiml(parsed.reply), {
      status: 200, headers: { 'Content-Type': 'text/xml' },
    })

  } catch (err) {
    console.error('voice-intake-agent error:', err)
    return new Response(sayAndHangupTwiml("Sorry, we're having a technical issue. Please try calling back shortly."), {
      status: 200, headers: { 'Content-Type': 'text/xml' },
    })
  }
})
