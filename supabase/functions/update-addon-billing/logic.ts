// Pure logic extracted from update-addon-billing/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

// Per-addon Stripe Price objects are supplied as one Supabase secret per
// addon key, named STRIPE_PRICE_ID_ADDON_<KEY> — e.g. the "ai_quotes" addon
// (see src/maxAddons.js's MAX_ADDONS catalog) reads
// STRIPE_PRICE_ID_ADDON_AI_QUOTES. Centralised here so index.ts and tests
// never duplicate the naming rule.
export function addonPriceEnvVar(key: string): string {
  return `STRIPE_PRICE_ID_ADDON_${key.toUpperCase()}`
}

export function isValidAction(action: unknown): action is 'enable' | 'disable' {
  return action === 'enable' || action === 'disable'
}

export interface AddonBillingState {
  max_addons?: Record<string, boolean> | null
  max_addon_stripe_items?: Record<string, string> | null
}

// Claim-before-act idempotency check: if this business already has a live
// Stripe subscription item for this addon, enabling again should be a
// no-op on Stripe (never create a second paid item for the same addon).
export function existingStripeItemId(business: AddonBillingState | null | undefined, key: string): string | null {
  return business?.max_addon_stripe_items?.[key] || null
}

// Patch after a brand-new Stripe subscription item was created.
export function buildEnabledPatch(business: AddonBillingState | null | undefined, key: string, itemId: string) {
  return {
    max_addons: { ...(business?.max_addons || {}), [key]: true },
    max_addon_stripe_items: { ...(business?.max_addon_stripe_items || {}), [key]: itemId },
  }
}

// Patch when a Stripe item already existed (idempotent re-enable) — only
// the flag needs touching, max_addon_stripe_items is already correct.
export function buildEnabledNoopPatch(business: AddonBillingState | null | undefined, key: string) {
  return { max_addons: { ...(business?.max_addons || {}), [key]: true } }
}

// Patch after removing (or finding nothing to remove for) a Stripe item.
export function buildDisabledPatch(business: AddonBillingState | null | undefined, key: string) {
  const items = { ...(business?.max_addon_stripe_items || {}) }
  delete items[key]
  return {
    max_addons: { ...(business?.max_addons || {}), [key]: false },
    max_addon_stripe_items: items,
  }
}
