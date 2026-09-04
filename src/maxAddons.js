// Minerva Max — shared add-on catalog + gating helpers.
// Single source of truth for what "Minerva Max" is: not one $300-500
// on/off switch, but a set of individually-salable add-ons layered on top
// of every existing tier. A business enables them one at a time (usually
// nudged by real usage data — see computeUpsellNudges below) and only
// approaches full "Max" pricing once several are already sticking.
//
// Every feature listed here already exists in the product (Minerva Max
// batch + round-2 batch, both 2026-09-04). This file is the monetization
// layer on top of already-built features, not new functionality.
//
// hasAddon()/isTrialing() read businesses.max_addons / max_addon_trials —
// see supabase_schema_delta_minerva_max_tier.sql. Both the frontend and
// edge functions should use these same two functions so "is this addon
// active" never drifts between client and server.

export const TRIAL_DAYS = 30

export const MAX_ADDONS = [
  {
    key: 'surge_pricing',
    name: 'Emergency Surge Pricing',
    price: 39,
    tagline: 'Never forget to charge the after-hours premium',
    description: 'Suggests a $75 base + after-hours/weekend premium line item on emergency-urgency jobs. Editable/removable, never auto-applied.',
  },
  {
    key: 'ai_quotes',
    name: 'AI Quote Drafting',
    price: 49,
    tagline: 'Turn a phone call into a sendable quote in seconds',
    description: 'Drafts a line-itemed quote from a plain-English job description. Falls back to a blank line item if AI is unavailable — dispatcher always reviews before sending.',
  },
  {
    key: 'crew_splitting',
    name: 'Multi-Tech Job Splitting',
    price: 59,
    tagline: 'Put more than one technician on a job without breaking payroll',
    description: 'Add crew to a job alongside the lead technician. Payroll, hours and GPS logic stay keyed off the lead only.',
  },
  {
    key: 'review_loop',
    name: 'Review Request Loop',
    price: 29,
    tagline: 'More Google reviews without lifting a finger',
    description: 'One-click SMS review request after a paid invoice, with click-through tracking. Requires a Google review link set in Settings.',
  },
  {
    key: 'demand_forecast',
    name: 'Demand Trend Alerts',
    price: 29,
    tagline: 'See which areas are heating up before you get the call',
    description: 'Weekly trend comparison of recent vs prior bookings by address. Directional trend math, not a predictive model.',
  },
  {
    key: 'subcontractor_pool',
    name: 'Subcontractor Pool',
    price: 39,
    tagline: 'Absorb overflow demand without hiring',
    description: 'Maintain a pool of subcontractors and assign overflow jobs to them, kept fully separate from employee payroll.',
  },
  {
    key: 'asset_intelligence',
    name: 'Asset Intelligence',
    price: 39,
    tagline: 'Catch failing gear and idle assets before they cost you',
    description: 'Predictive maintenance flags based on each asset\'s own telemetry trend, plus idle-asset alerts after 14+ days of no activity. Not cross-fleet ML.',
  },
  {
    key: 'carbon_estimate',
    name: 'Carbon/ESG Estimate',
    price: 19,
    tagline: 'A directional number for tender paperwork',
    description: 'Straight-line transit distance x a static emissions factor. An estimate for reporting, not a compliance-grade audit.',
  },
  {
    key: 'xero_sync',
    name: 'Xero Sync',
    price: 39,
    tagline: 'Push invoices straight to your accountant',
    description: 'Syncs paid invoices to Xero as draft ACCREC invoices. Never auto-authorised — your accountant still approves.',
  },
]

export function getAddonMeta(key) {
  return MAX_ADDONS.find(a => a.key === key) || null
}

export function hasAddon(business, key) {
  if (!business) return false
  if (business.max_addons?.[key] === true) return true
  return isTrialing(business, key)
}

export function isTrialing(business, key) {
  const trial = business?.max_addon_trials?.[key]
  if (!trial?.ends_at) return false
  return new Date(trial.ends_at).getTime() > Date.now()
}

export function trialDaysLeft(business, key) {
  const trial = business?.max_addon_trials?.[key]
  if (!trial?.ends_at) return 0
  const ms = new Date(trial.ends_at).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)))
}

export function hasUsedTrial(business, key) {
  return !!business?.max_addon_trials?.[key]
}

// Returns the { max_addons, max_addon_trials } patch to send to Supabase
// for enabling an addon outright (paid, or just flipped on in this
// pre-billing build — see the honest-scope note in the schema delta).
export function enableAddonPatch(business, key) {
  return { max_addons: { ...(business?.max_addons || {}), [key]: true } }
}

export function disableAddonPatch(business, key) {
  return { max_addons: { ...(business?.max_addons || {}), [key]: false } }
}

export function startTrialPatch(business, key) {
  const startedAt = new Date()
  const endsAt = new Date(startedAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)
  return {
    max_addon_trials: {
      ...(business?.max_addon_trials || {}),
      [key]: { started_at: startedAt.toISOString(), ends_at: endsAt.toISOString() },
    },
  }
}
