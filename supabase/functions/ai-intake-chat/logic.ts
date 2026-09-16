// Pure intake-triage logic for ai-intake-chat, extracted out of index.ts so
// it can be unit-tested with Vitest (edge functions themselves can't be
// imported into a Node test runner). index.ts imports these same functions,
// so this file IS the production logic, not a reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data.

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface TemplateLead {
  name: string
  phone: string
  suburb: string
  urgency: string
  job_description: string
  score: number
  score_reason: string
  estimated_value_tier: string
  referral_code: string | null
}

export interface IntakeResult {
  reply: string
  lead_captured: boolean
  lead: TemplateLead | null
}

import { clampScore, detectEmergency, detectValueTier, applyRepeatClientBoost as sharedApplyRepeatClientBoost } from "../_shared/leadTriage.ts"
export { clampScore, detectEmergency, detectValueTier }

// Matches the exact format generateReferralCode() produces
// (send-referral-code-sms/index.ts): always exactly 6 characters, drawn
// from an alphabet that excludes 0/O/1/I to avoid visual confusion. A
// loose 4-10 char A-Z0-9 pattern (the original version of this regex) was
// far too broad — it happily matched ordinary English words like "MATE"
// or "FRIEND" in the surrounding sentence before ever reaching the real
// code, producing false-positive captures. Constraining to the real
// generation alphabet at exactly 6 characters all but eliminates that.
export const REFERRAL_CODE_PATTERN = /\b[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}\b/

export function computeTemplateScore(isEmergency: boolean, jobDescriptionLength: number, isHighValue: boolean): number {
  let score = isEmergency ? 75 : 50
  if (jobDescriptionLength > 60) score += 10
  if (isHighValue) score += 10
  return clampScore(score)
}

// Opportunistic referral code scan across every user message — never asked
// for, only captured if volunteered alongside a referral-sounding phrase.
export function extractReferralCode(userMessages: string[]): string | null {
  for (const msg of userMessages) {
    if (/referr|mate said|friend said|code/i.test(msg)) {
      const match = msg.toUpperCase().match(REFERRAL_CODE_PATTERN)
      if (match) return match[0]
    }
  }
  return null
}

// Deterministic, non-AI intake flow used whenever ANTHROPIC_API_KEY isn't
// configured. Walks the same five required fields in a fixed order:
// job_description -> urgency -> name -> phone -> suburb. Every question is
// a plain string, not model-generated, and every judgement call below is a
// simple keyword/heuristic check rather than free-text understanding — this
// is deliberately narrower than the Claude path, not a hidden re-implementation
// of it. Scoring and lead persistence downstream treat both paths identically.
export function runTemplateIntake(business: { name: string; trade_type?: string | null; city?: string | null }, messages: ChatMessage[]): IntakeResult {
  // Only real user turns count as answers — the widget's static greeting
  // (if present as a leading assistant message) isn't an answer to anything.
  const userMessages = messages.filter(m => m.role === 'user').map(m => m.content.trim()).filter(Boolean)
  const answered = userMessages.length

  const referralCode = extractReferralCode(userMessages)
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
  const isEmergency = detectEmergency(urgencyAnswer)
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
  const estimatedValueTier = detectValueTier(combinedText)
  const isHighValue = estimatedValueTier === 'high'
  const score = computeTemplateScore(isEmergency, jobDescription.length, isHighValue)
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

// Re-exported from _shared/leadTriage.ts (also used by voice-intake-agent)
// so existing imports of this function from ai-intake-chat/logic.ts keep working.
export const applyRepeatClientBoost = sharedApplyRepeatClientBoost

// Same untrusted-public-input treatment for every UTM field — cap length
// and drop anything empty, rather than trusting whatever a URL's query
// string happened to contain.
export function cleanUtm(v?: string): string | null {
  return (typeof v === 'string' && v.trim()) ? v.trim().slice(0, 100) : null
}
