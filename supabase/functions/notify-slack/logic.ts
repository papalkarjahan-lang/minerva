// Pure logic extracted from notify-slack/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

export const RED = '#e01e5a'      // Slack's own "danger" red
export const AMBER = '#ecb22e'    // Slack's own "warning" yellow
export const GREEN = '#2eb67d'    // Slack's own "success" green
export const AUBERGINE = '#4a154b' // Slack's own brand purple — default/neutral

export const URGENT_EMOJIS = ['🚨', '⚠️', '👻']
export const POSITIVE_EMOJIS = ['💰', '🤝', '📈', '✅']

export function colorFor(leadingEmoji: string | null): string {
  if (!leadingEmoji) return AUBERGINE
  if (URGENT_EMOJIS.includes(leadingEmoji)) return leadingEmoji === '🚨' ? RED : AMBER
  if (POSITIVE_EMOJIS.includes(leadingEmoji)) return GREEN
  return AUBERGINE
}

// Every existing caller writes text in the shape "<emoji> *AgentName*: body"
// (see e.g. notify-slack call sites in track-consumables, detect-idle-assets,
// sequence-handoffs). Parse that out so it can become a real header block
// instead of just more inline text — falls back gracefully to a generic
// "Minerva" header for the few callers (nurture-stale-leads, winback-lost-
// leads, check-credential-expiry) that just forward a caller-built string.
export function parseAgentMessage(text: string): { emoji: string | null; agent: string | null; body: string } {
  const match = text.match(/^(\S+)\s+\*([^*]+)\*:\s*([\s\S]*)$/)
  if (match) {
    return { emoji: match[1], agent: match[2], body: match[3] }
  }
  return { emoji: null, agent: null, body: text }
}
