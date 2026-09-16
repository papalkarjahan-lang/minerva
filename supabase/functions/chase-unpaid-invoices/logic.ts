// Pure reminder-drafting/validation logic for chase-unpaid-invoices,
// extracted out of index.ts so it can be unit-tested with Vitest (edge
// functions themselves can't be imported into a Node test runner).
// index.ts imports these same functions, so this file IS the production
// logic, not a reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data.

export function computeDaysOverdue(createdAt: string, now: number = Date.now()): number {
  return Math.floor((now - new Date(createdAt).getTime()) / (24 * 60 * 60 * 1000))
}

export interface LineItem { description?: string | null }

// Line items become a short comma-joined job description for the Claude
// prompt context — empty/missing descriptions are dropped rather than
// producing an awkward blank entry.
export function summarizeJobDescription(lineItems: unknown): string {
  if (!Array.isArray(lineItems)) return ''
  return (lineItems as LineItem[]).map(li => li?.description).filter(Boolean).join(', ')
}

// Tone escalates with how many reminders have already gone out — friendly
// nudge on the first, firmer and more direct (never threatening) from the
// third onward.
export function selectTonePrompt(priorReminders: number): string {
  if (priorReminders >= 2) {
    return 'This is at least the 3rd reminder — the tone should be firmer and more direct (still polite, no threats), making clear payment is now overdue.'
  }
  if (priorReminders === 1) {
    return 'This is the 2nd reminder — a bit more direct than a first nudge, but still friendly.'
  }
  return 'This is the first reminder — keep it light and friendly, assume they just forgot.'
}

// A drafted SMS is only usable if it actually contains the required
// dollar amount and invoice link verbatim and fits in one SMS-length
// budget — otherwise the caller should fall back to the fixed template
// rather than risk sending a reminder that's missing the link.
export function isDraftUsable(text: string, link: string, amount: string): boolean {
  if (!text || text.length > 320) return false
  return text.includes(link) && text.includes(amount)
}
