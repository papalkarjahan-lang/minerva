// Pure logic extracted from reconcile-billing/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

// Stripe subscription quantity has a minimum of 1 seat even if zero
// technicians are currently connected — a business is never billed for
// zero seats.
export function computeLocalQuantity(count: number | null): number {
  return Math.max(1, count ?? 1)
}

export function isMismatch(stripeQuantity: number | null, localQuantity: number): boolean {
  return stripeQuantity !== null && stripeQuantity !== localQuantity
}

export function buildMismatchSlackMessage(bizName: string, stripeQuantity: number, localQuantity: number): string {
  return `⚠️ Billing drift detected for *${bizName}*: Stripe is billing ${stripeQuantity} technician(s), but ${localQuantity} are actually connected. Worth a manual check.`
}

export function buildMismatchFallbackSummary(bizName: string, stripeQuantity: number, localQuantity: number): string {
  return `Stripe billing count (${stripeQuantity}) does not match locally connected technicians (${localQuantity}) for ${bizName}.`
}

export function buildReasoningPrompt(bizName: string, stripeQuantity: number, localQuantity: number): string {
  return `A home-services SaaS reconciles Stripe subscription seat counts against locally-connected technicians daily. For business "${bizName}", Stripe is currently billing ${stripeQuantity} technician seat(s), but only ${localQuantity} technician(s) are actually connected locally (Stripe ${stripeQuantity > localQuantity ? 'higher' : 'lower'} than local by ${Math.abs(stripeQuantity - localQuantity)}). Give your single best-guess, one sentence, plain-English explanation of the most likely cause — e.g. a missed technician deactivation, a double-counted GPS ping inflating the local count, or a Stripe-side seat change that hasn't synced locally yet. Reply with ONLY that one sentence, no preamble.`
}

// Minerva Max add-on billing drift check (added 2026-10-01, same day
// update-addon-billing shipped). stripe-webhook only listens for
// checkout.session.completed/customer.subscription.deleted/invoice.*/
// payment_intent.succeeded — it does NOT handle customer.subscription.
// updated, which is what Stripe fires if a single subscription item (e.g.
// one add-on) is removed directly in the Stripe Dashboard without going
// through update-addon-billing. Since hasAddon()/isAddonActive() only ever
// check businesses.max_addons, a business could end up with that flag
// still true and a stale item id in max_addon_stripe_items — using a paid
// add-on for free with nothing actually being billed for it, undetected
// until a human happens to look at Stripe. Mirrors the existing
// quantity-mismatch check above: detect and alert only, never
// auto-correct, since a human should look at *why* before changing what a
// client is billed.
export function findStaleAddonItems(
  storedItems: Record<string, string> | null | undefined,
  liveItemIds: Set<string>
): string[] {
  if (!storedItems) return []
  return Object.entries(storedItems)
    .filter(([, itemId]) => !liveItemIds.has(itemId))
    .map(([key]) => key)
}

export function buildAddonDriftSlackMessage(bizName: string, staleKeys: string[]): string {
  return `⚠️ Add-on billing drift detected for *${bizName}*: ${staleKeys.join(', ')} still marked active locally, but the matching Stripe subscription item is gone. They may be using a paid add-on for free — worth a manual check.`
}

export function buildAddonDriftFallbackSummary(bizName: string, staleKeys: string[]): string {
  return `Minerva Max add-on(s) [${staleKeys.join(', ')}] are flagged active for ${bizName} but have no matching live Stripe subscription item.`
}

// Reverse direction of findStaleAddonItems above — that one only asks "is
// every item WE have on file still live in Stripe?" and can't see an item
// Stripe has that no key in max_addon_stripe_items points at (e.g. a
// double-created add-on item from a past failure mode, or any other cause
// of an untracked item). Deliberately doesn't try to identify WHICH add-on
// an untracked item belongs to — that would need its own hardcoded copy of
// every addon key, duplicated from src/maxAddons.js, just to exclude the
// one base per-technician seat item from the count. Comparing counts
// instead needs no such list and catches the same class of problem: if
// Stripe's live item count exceeds "1 base seat item + however many
// add-ons are recorded," something on this subscription isn't accounted
// for locally. (Added 2026-10-03, same round as the update-addon-billing
// double-create fix this is a safety net for.)
export function hasUntrackedSubscriptionItems(
  liveItemCount: number,
  storedItems: Record<string, string> | null | undefined
): boolean {
  const trackedCount = 1 + Object.keys(storedItems || {}).length // 1 = the base seat item
  return liveItemCount > trackedCount
}

export function buildUntrackedItemsSlackMessage(bizName: string, liveItemCount: number, trackedCount: number): string {
  return `⚠️ Untracked Stripe subscription item(s) for *${bizName}*: Stripe shows ${liveItemCount} item(s) on this subscription, but Minerva's own records only account for ${trackedCount}. Worth a manual check in the Stripe Dashboard — this can happen if an add-on was billed twice by mistake.`
}

export function buildUntrackedItemsFallbackSummary(bizName: string, liveItemCount: number, trackedCount: number): string {
  return `Stripe shows ${liveItemCount} subscription item(s) for ${bizName}, but Minerva's records only account for ${trackedCount}.`
}

// Picks the base per-technician seat item out of a subscription's items —
// used by the stripe_sub_item_id backfill self-heal in index.ts, which can
// race against update-addon-billing adding a real add-on item to the SAME
// subscription before this backfill ever runs (update-addon-billing only
// requires stripe_sub_id, not stripe_sub_item_id, to let a business enable
// an add-on — so this race is real, not theoretical, if checkout's own
// one-shot item-id fetch failed). Blindly taking items[0] risks storing an
// add-on's item id as stripe_sub_item_id instead, which sync-technician-
// billing would then silently adjust (the per-technician seat count) on
// the wrong item instead of the real one. Excludes every item id already
// recorded in max_addon_stripe_items — whatever's left is the seat item,
// by the same "1 base item + N recorded add-ons" invariant
// hasUntrackedSubscriptionItems above already relies on. Falls back to the
// first item if every item happens to be a known add-on (shouldn't happen
// given that invariant, but never returns nothing when at least one item
// exists).
export function pickSeatItemId(
  items: Array<{ id: string }>,
  storedAddonItems: Record<string, string> | null | undefined
): string | null {
  if (items.length === 0) return null
  const addonItemIds = new Set(Object.values(storedAddonItems || {}))
  const seatItem = items.find(item => !addonItemIds.has(item.id))
  return seatItem?.id ?? items[0].id
}
