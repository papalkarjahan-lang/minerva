// Shared AI-draft usability check for autonomous SMS-drafting functions
// (nurture-stale-leads, retention-checkin, winback-lost-leads) that ask
// Claude to draft a short SMS but must fall back to a fixed template if
// the draft comes back empty or too long for a single SMS.

export function isPlainDraftUsable(text: string, maxLength: number = 300): boolean {
  return !!text && text.length <= maxLength
}
