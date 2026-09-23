// Pure sanitization logic for parse-prospect-text, extracted so the
// "clean up whatever Claude handed back" step can be unit tested with
// Vitest without a live Claude/Supabase connection or the Deno runtime.
// index.ts imports this same function and only adds the actual I/O (the
// Claude API call, the Supabase insert) around it — this file IS the
// production sanitization logic, not a reimplementation of it.

export interface SanitizedProspectRow {
  company_name: string
  contact_name: string | null
  contact_email: string | null
  contact_phone: string | null
  trade_type: string | null
  city: string | null
}

// Claude's raw JSON response is untrusted input: it could contain rows
// with no company_name, more than 100 rows in one paste, or fields far
// longer than the outreach_prospects columns allow. Filters, caps, and
// truncates before anything reaches the database.
export function sanitizeExtractedProspects(rawParsed: unknown[]): SanitizedProspectRow[] {
  return rawParsed
    .filter((r: any) => r?.company_name)
    .slice(0, 100)
    .map((r: any) => ({
      company_name: String(r.company_name).slice(0, 200),
      contact_name: r.contact_name ? String(r.contact_name).slice(0, 200) : null,
      contact_email: r.contact_email ? String(r.contact_email).slice(0, 200) : null,
      contact_phone: r.contact_phone ? String(r.contact_phone).slice(0, 50) : null,
      trade_type: r.trade_type ? String(r.trade_type).slice(0, 50) : null,
      city: r.city ? String(r.city).slice(0, 100) : null,
    }))
}
