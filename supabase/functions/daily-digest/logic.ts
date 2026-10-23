// Pure invoice-aggregation and quiet-day logic for daily-digest, extracted
// out of index.ts so it can be unit-tested with Vitest (edge functions
// themselves can't be imported into a Node test runner). index.ts imports
// these same functions, so this file IS the production logic, not a
// reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data.

export interface InvoiceRecord {
  total: number | string | null
  status: string
}

export interface InvoiceStats {
  invoiced: number
  unpaid: number
  avgInvoice: number
}

// Excludes voided invoices from every total — a voided invoice was created
// by mistake, so counting it toward "invoiced" or the average would
// overstate real revenue activity for the day.
export function computeInvoiceStats(invoices: InvoiceRecord[]): InvoiceStats {
  const liveInvoices = invoices.filter(i => i.status !== 'void')
  const invoiced = liveInvoices.reduce((sum, i) => sum + Number(i.total || 0), 0)
  const unpaid = liveInvoices.filter(i => i.status === 'unpaid').reduce((sum, i) => sum + Number(i.total || 0), 0)
  const avgInvoice = liveInvoices.length > 0 ? invoiced / liveInvoices.length : 0
  return { invoiced, unpaid, avgInvoice }
}

export interface DigestCounts {
  jobsDone: number
  leadsIn: number
  invoiced: number
  pendingDraftsCount: number
  lowStockCount: number
  silentLeadsCount: number
  stuckInvoicesCount: number
}

// A genuinely quiet day — no point pinging an empty digest. hasWeeklySavings
// (added 2026-10-23, see the weekly savings recap below) keeps an otherwise
// silent day from being skipped when it's the one day a week this digest
// also carries the fleet-optimizer ROI callout — going quiet on the exact
// day meant to reinforce "this is still working for you" would undercut
// the point of adding it.
export function isQuietDay(counts: DigestCounts, hasWeeklySavings = false): boolean {
  if (hasWeeklySavings) return false
  return counts.jobsDone === 0 && counts.leadsIn === 0 && counts.invoiced === 0 &&
    counts.pendingDraftsCount === 0 && counts.lowStockCount === 0 &&
    counts.silentLeadsCount === 0 && counts.stuckInvoicesCount === 0
}

// Same ATO cents-per-km estimate as src/utils.js's estimateDollarsFromKm —
// duplicated rather than imported (edge functions can't import from src/,
// same reasoning that file's own header already gives for reimplementing
// shared logic rather than reaching across the Deno/Node boundary).
export const ATO_CENTS_PER_KM_2026_27 = 0.91

export function estimateDollarsFromKm(km: number | null | undefined, ratePerKm = ATO_CENTS_PER_KM_2026_27): number {
  const safeKm = Number(km) || 0
  return Math.round(safeKm * ratePerKm)
}

// Weekly savings recap (added 2026-10-23): daily-digest already shows
// total_km_saved live in DispatcherView.jsx, but only when a dispatcher
// happens to open the console — nothing proactively reinforces the fleet
// optimizer's ROI to a business that doesn't log in every day. Once a
// week, Monday in the business's own local time (not UTC — this cron
// fires at 22:00 UTC, already Monday morning in Sydney, so a naive
// `new Date().getUTCDay()` would check Sunday instead, the same
// local-vs-UTC day mismatch check-weather-risk's own logic.ts was built
// to avoid), the digest adds a short savings callout on top of its
// normal content.
export function isWeeklySavingsDay(date: Date, timeZone: string): boolean {
  return new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long' }).format(date) === 'Monday'
}
