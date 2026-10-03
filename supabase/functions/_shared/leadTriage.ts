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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Word/phrase-boundary match, not a plain substring check — every keyword
// list below used to be checked with plain .includes(), which also fires
// on an unrelated word that merely CONTAINS the keyword: "fully booked
// Thursday" matching HIGH_VALUE's 'full', "can I pay in installments"
// matching 'install', and worst of all "the smoked glass shower screen
// cracked" matching EMERGENCY's 'smoke' — none of which are actually
// about a full system replacement, a new install, or a gas/fire
// emergency. \b only anchors at the position it's placed, so this still
// matches multi-word phrases like "right now" or "can't wait" correctly
// as whole phrases, not just single words.
function containsKeyword(text: string, keyword: string): boolean {
  return new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'i').test(text)
}

export function detectEmergency(urgencyAnswer: string): boolean {
  if (NEGATED_URGENCY_PATTERN.test(urgencyAnswer)) return false
  // No separate "urgent"/"emergency" fallback needed — both words are
  // already literal entries in EMERGENCY_KEYWORDS, so containsKeyword
  // already covers them with the exact same word-boundary semantics a
  // separate check would.
  return EMERGENCY_KEYWORDS.some(kw => containsKeyword(urgencyAnswer, kw))
}

export function detectValueTier(combinedText: string): 'low' | 'medium' | 'high' {
  const isHighValue = HIGH_VALUE_KEYWORDS.some(kw => containsKeyword(combinedText, kw))
  const isLowValue = !isHighValue && LOW_VALUE_KEYWORDS.some(kw => containsKeyword(combinedText, kw))
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
