// Shared "has this business's signup trial run out without ever completing
// Stripe checkout" check. Onboarding.jsx promises "14-day free trial — no
// charge today" and creates the businesses/technicians rows immediately,
// before the Stripe redirect even happens — so a business that abandons or
// never finishes checkout has no actual time limit anywhere: subscription_
// tier stays whatever tier was picked at signup forever, since nothing
// server-side ever re-checks it (stripe-webhook only ever writes
// subscription_tier:'cancelled' on an existing subscription's
// customer.subscription.deleted, which an abandoner never had).
//
// Computed fresh from fields already loaded on every business query
// (stripe_sub_id, created_at) rather than a stored flag, so it's
// self-healing the instant a real checkout completes — no new column, no
// cron, nothing to clear back out.
export const SIGNUP_TRIAL_DAYS = 14

export function isTrialExpired(business) {
  if (!business || business.stripe_sub_id) return false
  if (!business.created_at) return false
  const ageMs = Date.now() - new Date(business.created_at).getTime()
  return ageMs > SIGNUP_TRIAL_DAYS * 24 * 60 * 60 * 1000
}
