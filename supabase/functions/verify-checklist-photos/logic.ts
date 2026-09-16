// Pure logic extracted from verify-checklist-photos/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

export type PhotoVerificationStatus = 'pass' | 'flagged' | 'unavailable'

// Parses Claude's vision-review reply, expected in the format:
//   STATUS: pass|flagged | NOTES: <one short sentence>
// Any response that doesn't match this format must come back 'unavailable'
// (never 'pass') — an unreviewed/unparseable photo must never silently look
// like a passed inspection (fixed 2026-09-08, see index.ts comment).
export function parseReviewResponse(text: string): { status: PhotoVerificationStatus; notes: string } {
  const statusMatch = text.match(/STATUS:\s*(pass|flagged)/i)
  const notesMatch = text.match(/NOTES:\s*(.+)/i)
  const status: PhotoVerificationStatus = statusMatch ? (statusMatch[1].toLowerCase() as 'pass' | 'flagged') : 'unavailable'
  const notes = notesMatch
    ? notesMatch[1].trim()
    : (statusMatch ? text.trim().slice(0, 200) : `AI review response didn't match expected format — photo not AI-reviewed. Raw: ${text.trim().slice(0, 150)}`)
  return { status, notes }
}

// A job becomes "AI-verified" only once every photo attached to it has a
// verification_status of 'pass' — any 'pending' (not yet reviewed) or
// 'unavailable' (never actually reviewed, e.g. missing API key or parse
// failure) or 'flagged' must block the badge. See index.ts comment
// (fixed 2026-09-08) for why 'unavailable' must block just like 'pending'.
export function shouldMarkJobVerified(photoStatuses: PhotoVerificationStatus[] | string[]): boolean {
  if (photoStatuses.length === 0) return false
  return photoStatuses.every(s => s === 'pass')
}
