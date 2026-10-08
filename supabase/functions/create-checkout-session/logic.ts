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

// Pro-tier/sector mismatch guard (added 2026-10-08, moved to
// ../_shared/tierEligibility.ts 2026-10-08 once stripe-webhook needed the
// identical check for the Customer-Portal self-serve-switch path this
// file's own guard doesn't cover — see that shared file's header and
// BILLING_INTEGRITY_NOTES.md's "Pro tier has nothing for Industrial"
// entry for the full trace). Re-exported here so nothing that already
// imports `isTierAvailableForSector` from this file breaks.
export { isTierAvailableForSector } from "../_shared/tierEligibility.ts"
