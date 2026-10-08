// Shared "is this subscription tier actually available for this business's
// sector" check. Originally lived only in create-checkout-session/logic.ts
// (added 2026-10-08, see BILLING_INTEGRITY_NOTES.md's "Pro tier has
// nothing for Industrial" entry) — moved here once stripe-webhook needed
// the exact same check too, same reasoning _shared/maxAddons.ts's own
// header gives for its own move: two call sites with their own copies is a
// drift risk the moment the rule ever changes.
//
// Pro ($119/tech/mo) is marketed as Standard + 6 trade-console-only
// features. create-checkout-session uses this to refuse selling Pro to an
// industrial business at signup; stripe-webhook uses it to catch the
// SEPARATE path that fix doesn't cover — an existing customer self-serving
// a plan switch to Pro through Stripe's own Customer Portal, which never
// goes through create-checkout-session at all.
export function isTierAvailableForSector(
  tier: string | null | undefined,
  sector: string | null | undefined
): boolean {
  if (tier === 'pro' && sector === 'industrial') return false
  return true
}
