// Shared lead-triage primitives used by both ai-intake-chat (text widget)
// and voice-intake-agent (phone). Both functions run an almost-identical
// deterministic template flow when ANTHROPIC_API_KEY is unset — this file
// is the single source of truth for the keyword/threshold logic that was
// previously copy-pasted between them (and had drifted into carrying the
// same bug in both copies).

export const EMERGENCY_KEYWORDS = [
  'emergency', 'urgent', 'asap', 'right now', 'burst', 'flooding', 'flood',
  'no power', 'no water', 'gas smell', 'gas leak', 'sparking', 'smoke',
  'leaking everywhere', 'locked out', "can't wait", 'cannot wait', 'now please',
]
export const HIGH_VALUE_KEYWORDS = ['renovation', 'renovate', 'install', 'installation', 'replace', 'full', 'whole', 'new system', 'rewire', 'regas']
export const LOW_VALUE_KEYWORDS = ['quick', 'small', 'minor', 'quote only', 'just a', 'tap', 'leaky tap']

// Clamp a score into the valid 0-100 range.
export function clampScore(n: number): number {
  return Math.max(0, Math.min(100, n))
}

// A negated phrase ("not urgent", "no rush", "can wait") must win over a
// bare keyword match — a plain substring/word check on "urgent"/"emergency"
// would otherwise misclassify a customer explicitly saying their job is
// NOT urgent as an emergency lead.
const NEGATED_URGENCY_PATTERN = /\bnot\s+(that\s+|really\s+)?urgent\b|\bnot\s+an?\s+emergency\b|\bisn'?t\s+urgent\b|\bno\s+rush\b|\bno\s+emergency\b|\bcan\s+wait\b|\bcould\s+wait\b/i

export function detectEmergency(urgencyAnswer: string): boolean {
  if (NEGATED_URGENCY_PATTERN.test(urgencyAnswer)) return false
  return EMERGENCY_KEYWORDS.some(kw => urgencyAnswer.includes(kw)) || /\burgent\b|\bemergency\b/.test(urgencyAnswer)
}

export function detectValueTier(combinedText: string): 'low' | 'medium' | 'high' {
  const isHighValue = HIGH_VALUE_KEYWORDS.some(kw => combinedText.includes(kw))
  const isLowValue = !isHighValue && LOW_VALUE_KEYWORDS.some(kw => combinedText.includes(kw))
  return isHighValue ? 'high' : isLowValue ? 'low' : 'medium'
}

// Repeat-client scoring boost applied after either intake path (template
// or Claude) — a known client is a warmer lead than a stranger, so it
// earns a deterministic boost on top of the content-based score.
export function applyRepeatClientBoost(score: number, scoreReason: string, isRepeatClient: boolean): { score: number; scoreReason: string } {
  if (!isRepeatClient) return { score, scoreReason }
  const boosted = Math.min(100, score + 15)
  const reason = scoreReason ? `${scoreReason} Returning client (+15).` : 'Returning client.'
  return { score: boosted, scoreReason: reason }
}
