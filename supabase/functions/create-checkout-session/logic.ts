// Pure decision logic for create-checkout-session, extracted so it can be
// unit tested with Vitest without a live Deno/Supabase/Stripe connection —
// same convention as stripe-webhook/logic.ts and others in this project.

// Checkout-hijack guard (added 2026-10-08) — see
// supabase_schema_delta_checkout_hijack_guard.sql's header and
// SECURITY_NOTES.md's matching dated entry for the full scenario this
// closes. create-checkout-session has no caller-identity check by design
// (its one legitimate caller, Onboarding.jsx, runs pre-auth), so this is
// the one gate standing between "the business that was just created" and
// "any business id a caller supplies."
//
// storedToken is whatever is currently on the target business's row
// (null for a business that pre-dates this column). providedToken is
// whatever the caller's request body claims. Returns false — never
// throws — so the caller can turn a false result into a generic "invalid
// checkout token" error without distinguishing "business not found" from
// "wrong token" (telling those apart would help an attacker enumerate
// valid business ids).
//
// The explicit `!providedToken` check matters on its own, separate from
// the equality check below: without it, a legacy row with a genuinely
// null storedToken would match a caller who simply sends null/omits the
// field entirely (null === null), reopening this exact gap for every
// business created before this column existed.
export function shouldAllowCheckoutCreation(
  storedToken: string | null | undefined,
  providedToken: string | null | undefined
): boolean {
  if (!providedToken) return false
  return storedToken === providedToken
}

// Pro-tier/sector mismatch guard (added 2026-10-08) — see
// BILLING_INTEGRITY_NOTES.md's "Pro tier has nothing for Industrial"
// entry for the full trace. Pro ($119/tech/mo) is marketed
// (Onboarding.jsx's/Pricing.jsx's own TIERS copy) as Standard + 6
// specific features — on-site invoicing, asset tracking, compliance
// checklists, materials/inventory tracking, technician credential
// tracking, automated growth marketing. Every one of those 6 is
// implemented ONLY in the trade-sector console (DispatcherView.jsx) and
// enforced server-side via subscription_tier==='pro' with no sector
// awareness at all — IndustrialDispatcherView.jsx has zero equivalent
// UI, and generate-growth-drafts' own tier filter is the same story.
// An industrial-sector business that selects Pro would be charged
// $119/tech/mo, every month, for exactly the same functionality as
// Standard ($79/tech/mo) — not a race, not an edge case, a guaranteed
// every-time overcharge for nothing. This is checked here (the one
// chokepoint that actually attaches a real, recurring Stripe price),
// not just hidden in Onboarding.jsx's UI, for the same reason every
// other paid-feature guard in this codebase lives at the point of the
// actual write/charge rather than relying on a hidden button alone.
export function isTierAvailableForSector(
  tier: string | null | undefined,
  sector: string | null | undefined
): boolean {
  if (tier === 'pro' && sector === 'industrial') return false
  return true
}
