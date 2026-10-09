// Pure decision logic for draft-outreach-batch, extracted so the
// plain-template fallback (used whenever ANTHROPIC_API_KEY is unset or a
// specific AI draft call fails) and the opt-out-line append rule can be
// unit tested with Vitest without a live Claude/Supabase connection or the
// Deno runtime. index.ts imports these same functions and only adds the
// actual I/O (the Claude API call, the Supabase update) around them — this
// file IS the production decision logic, not a reimplementation of it.

export interface OutreachProspect {
  contact_name: string | null
  trade_type: string | null
  company_name: string | null
}

// Sector-aware (added 2026-10-10) — this used to say the exact same thing
// to every prospect regardless of trade_type, including "sync invoices
// straight to Xero" to an 'industrial' prospect. Xero sync is a trade-only
// Minerva Max add-on (requiresSector: 'trade' in src/maxAddons.js, fixed
// 2026-10-09 — see BILLING_INTEGRITY_NOTES.md) and Pro tier (the
// $119/tech/mo ceiling this template used to quote unconditionally) isn't
// offered to Industrial at all. Same "sold vs. delivered" bug class found
// repeatedly elsewhere in this project, just reached via outreach copy
// instead of the product itself — the fix here is the same: don't
// describe a capability or price point to a prospect who could never
// actually reach it once signed up.
export function fallbackTemplate(p: OutreachProspect): { subject: string; body: string } {
  const name = p.contact_name || 'there'
  const trade = p.trade_type || 'trade'
  const company = p.company_name || 'your business'
  const isIndustrial = p.trade_type === 'industrial'
  const pitch = isIndustrial
    ? 'track crews and assets live across sites, log safety incidents, and keep an asset register with maintenance alerts'
    : 'track technicians live, auto-text customers when jobs are on the way, and sync invoices straight to Xero'
  const priceLine = isIndustrial ? '$49-$79/tech/month' : '$49-$119/tech/month'
  return {
    subject: `Quick question for ${company}`,
    body: `Hi ${name},\n\nI help ${trade} businesses in Australia ${pitch} — no app install, about 20 minutes to set up. ${priceLine}, 7-day free trial.\n\nWorth a 10-minute look for ${company}?\n\n(edit this before sending — this is the plain-template fallback, not an AI-personalized draft)`,
  }
}

// Spam Act 2003 (Cth) requires every commercial electronic message to carry
// a functional unsubscribe facility. Appends the opt-out line only if the
// draft (AI or fallback) doesn't already mention it, so a Claude draft that
// already followed the prompt's instruction never gets it duplicated.
export function appendUnsubscribeIfMissing(body: string, unsubscribeLine: string): string {
  return body.includes('unsubscribe') ? body : body + unsubscribeLine
}
