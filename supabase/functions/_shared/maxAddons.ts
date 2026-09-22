// Shared "is this Minerva Max add-on active for this business" check.
// Before this file existed, 10 different edge functions (draft-quote,
// send-quote-sms, send-review-request-sms, auto-assign-technician,
// xero-oauth-connect, xero-sync-invoice, detect-idle-assets,
// predict-asset-maintenance, estimate-job-carbon, forecast-demand) each
// had their own copy-pasted inline version of this exact check — a real
// drift risk, since a future addon-eligibility rule change would have had
// to be found and applied in 10 separate places by hand.
//
// Mirrors src/maxAddons.js's hasAddon()/isTrialing() logic exactly. The
// frontend and edge functions can't literally share one module (different
// runtimes — Vite/browser vs Deno), so this is the backend-side single
// source of truth every edge function should import instead of re-deriving
// its own copy.

export interface AddonState {
  max_addons?: Record<string, boolean> | null
  max_addon_trials?: Record<string, { ends_at?: string | null }> | null
}

export function isAddonActive(business: AddonState | null | undefined, key: string): boolean {
  if (!business) return false
  if (business.max_addons?.[key] === true) return true
  const trial = business.max_addon_trials?.[key]
  return !!trial?.ends_at && new Date(trial.ends_at).getTime() > Date.now()
}
