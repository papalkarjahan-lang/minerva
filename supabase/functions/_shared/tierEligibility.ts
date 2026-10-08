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

// Standard-tier automation gate (added 2026-10-09) — see
// BILLING_INTEGRITY_NOTES.md's "Standard tier had no real differentiator
// from Starter" entry for the full trace. Standard ($79/tech/mo) was
// marketed as "Recommended for growing teams" but had zero functional
// difference from Starter ($49/tech/mo) anywhere in the codebase —
// confirmed by grepping every tier check in the project, every one of
// which only ever tested for 'pro'. The user's own choice, given the
// finding: build a real feature set for Standard rather than collapse it
// or leave it as an unexplained price gap.
//
// The fix reuses 6 fully-built, already-proven autonomous functions that
// were running completely ungated for every business regardless of
// tier — proactive lead/client/invoice lifecycle automation
// (chase-unpaid-invoices, nurture-stale-leads, retention-checkin,
// winback-lost-leads, check-weather-risk, detect-wasted-trips) — rather
// than inventing new functionality. This is a genuine "growing team"
// differentiator: Starter is the core live-dispatch tool; Standard adds
// the automation that keeps leads/clients/invoices from falling through
// the cracks once there's more volume than one person can personally
// track by hand. Deliberately excludes the OTHER ungated autonomous
// functions this project has (daily-digest, reconcile-technician-state,
// and every operator/Minerva-facing one like flag-abandoned-signups) —
// daily-digest is a basic utility every tier should keep (a summary, not
// a proactive save), reconcile-technician-state is an internal self-heal
// with no customer-visible "feature" shape, and the operator-facing ones
// aren't a business's own feature at all.
//
// A business with no subscription yet (mid-trial, before Onboarding.jsx's
// chosen tier even reflects a completed Stripe checkout) still has a real
// `subscription_tier` value set at signup (Starter/Standard/Pro, whatever
// was picked) — same column this function already reads for every other
// tier check in this codebase, deliberately not re-deriving eligibility
// from `stripe_sub_id`/trial state, which is a different question
// (whether they're PAYING, not which tier they picked).
//
// **Correction, same day, before this ever shipped**: the first version
// of this function checked tier alone. Re-examining it against the exact
// question that found the Pro/Industrial bug ("does every business that
// can buy this actually have data in the tables it reads") caught the
// same bug class being reintroduced here — `IndustrialDispatcherView.jsx`
// never touches `invoices`, `leads`, or `jobs` at all (confirmed by grep:
// zero results for all three); industrial has its own separate data model
// entirely (`industrial_leads`, `site_projects`, `safety_incidents`, ...).
// All 5 of the functions this gates (chase-unpaid-invoices, nurture-
// stale-leads, retention-checkin, winback-lost-leads, detect-wasted-trips)
// read exactly those 3 tables — an industrial Standard customer would
// have gotten the identical "paying more for nothing reachable" problem
// this whole fix exists to close, just moved from Pro to Standard. Now
// requires sector === 'trade' explicitly, same proven pattern as
// isTierAvailableForSector above, rather than tier alone.
export function hasStandardAutomation(
  tier: string | null | undefined,
  sector: string | null | undefined
): boolean {
  return (tier === 'standard' || tier === 'pro') && sector === 'trade'
}
