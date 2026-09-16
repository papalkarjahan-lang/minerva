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

// A genuinely quiet day — no point pinging an empty digest.
export function isQuietDay(counts: DigestCounts): boolean {
  return counts.jobsDone === 0 && counts.leadsIn === 0 && counts.invoiced === 0 &&
    counts.pendingDraftsCount === 0 && counts.lowStockCount === 0 &&
    counts.silentLeadsCount === 0 && counts.stuckInvoicesCount === 0
}
