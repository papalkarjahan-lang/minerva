// Pure phone-intake-triage logic for voice-intake-agent, extracted out of
// index.ts so it can be unit-tested with Vitest (edge functions themselves
// can't be imported into a Node test runner). index.ts imports these same
// functions, so this file IS the production logic, not a reimplementation.
//
// Shares its keyword/threshold primitives with ai-intake-chat via
// _shared/leadTriage.ts (both functions run the same kind of deterministic
// template flow when ANTHROPIC_API_KEY is unset) — only the parts that
// genuinely differ between phone and text (one fewer field; a shorter
// job-description length threshold, since callers speak more tersely than
// they type) stay local to this file.

import { clampScore, detectEmergency, detectValueTier, applyRepeatClientBoost as sharedApplyRepeatClientBoost } from "../_shared/leadTriage.ts"
export { clampScore, detectEmergency, detectValueTier }
export const applyRepeatClientBoost = sharedApplyRepeatClientBoost

export interface IntakeResult {
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

export function computeVoiceTemplateScore(isEmergency: boolean, jobDescriptionLength: number, isHighValue: boolean): number {
  let score = isEmergency ? 75 : 50
  if (jobDescriptionLength > 40) score += 10
  if (isHighValue) score += 10
  return clampScore(score)
}

// Deterministic, non-AI phone flow used whenever ANTHROPIC_API_KEY isn't
// configured. Only 4 fields (name, urgency, suburb, job_description) since
// the caller's phone number is already known from Caller ID — one field
// shorter than ai-intake-chat's text version, which has no equivalent of
// caller ID. Every question is a plain string, every judgement a simple
// keyword check — same honesty boundary as ai-intake-chat's template path.
export function runTemplateVoiceIntake(business: { name: string }, userTurns: string[]): IntakeResult {
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
  const isEmergency = detectEmergency(urgencyAnswer)
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
  const estimatedValueTier = detectValueTier(combinedText)
  const isHighValue = estimatedValueTier === 'high'
  const score = computeVoiceTemplateScore(isEmergency, jobDescription.length, isHighValue)

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
