// Shared, tested safety net for "never contact an unsubscribed outreach
// prospect" — the one rule that must hold regardless of which other
// status-based filter draft-outreach-batch / followup-outreach /
// send-outreach-batch each apply for their own purpose.
//
// Added 2026-10-10 after a full outreach-pipeline audit found this check
// existed only as inline Supabase query-builder filters
// (`.is('unsubscribed_at', null)`) repeated across all three functions,
// with nothing testing it and nothing stopping a future edit from
// accidentally dropping it from one of them. Each function's own DB
// query already applies this filter at fetch time — that's still the
// primary, more efficient check (no point fetching rows you're about to
// discard). This is the belt-and-suspenders second layer: filter the
// fetched rows through this same, tested predicate again before acting
// on any of them, so a regression in the query itself still can't reach
// an unsubscribed prospect. Same "a single inline check with nothing
// backing it up is a real risk, not a hypothetical one" reasoning this
// project has already applied to client-side-only gates elsewhere.
export interface OutreachEligibilityCheck {
  unsubscribed_at?: string | null
}

export function isOutreachEligible(p: OutreachEligibilityCheck): boolean {
  return !p.unsubscribed_at
}
