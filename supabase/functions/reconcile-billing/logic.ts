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
