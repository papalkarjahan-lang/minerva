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

export function fallbackTemplate(p: OutreachProspect): { subject: string; body: string } {
  const name = p.contact_name || 'there'
  const trade = p.trade_type || 'trade'
  const company = p.company_name || 'your business'
  return {
    subject: `Quick question for ${company}`,
    body: `Hi ${name},\n\nI help ${trade} businesses in Australia track technicians live, auto-text customers when jobs are on the way, and sync invoices straight to Xero — no app install, about 20 minutes to set up. $49-$119/tech/month, 7-day free trial.\n\nWorth a 10-minute look for ${company}?\n\n(edit this before sending — this is the plain-template fallback, not an AI-personalized draft)`,
  }
}

// Spam Act 2003 (Cth) requires every commercial electronic message to carry
// a functional unsubscribe facility. Appends the opt-out line only if the
// draft (AI or fallback) doesn't already mention it, so a Claude draft that
// already followed the prompt's instruction never gets it duplicated.
export function appendUnsubscribeIfMissing(body: string, unsubscribeLine: string): string {
  return body.includes('unsubscribe') ? body : body + unsubscribeLine
}
