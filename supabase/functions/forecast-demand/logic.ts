// Pure address-bucketing/trend-ratio logic for forecast-demand, extracted
// out of index.ts so it can be unit-tested with Vitest (edge functions
// themselves can't be imported into a Node test runner). index.ts imports
// these same functions, so this file IS the production logic, not a
// reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data/dates.

export const MIN_RECENT_COUNT = 3 // don't flag noise from 1-2 jobs
export const TREND_RATIO = 1.3 // recent 2wk avg must be >= 1.3x older 2wk avg

export interface JobRecord {
  client_address: string | null
  created_at: string
}

export interface AddressBucket {
  recent: number
  older: number
}

// Buckets jobs by trimmed client_address into "recent 2 weeks" vs "the 2
// weeks before that", relative to `now`. Jobs with a blank address are
// skipped.
export function bucketJobsByAddress(jobs: JobRecord[], now: number): Record<string, AddressBucket> {
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000
  const recentCutoff = now - twoWeeksMs
  const buckets: Record<string, AddressBucket> = {}
  for (const job of jobs) {
    const addr = (job.client_address || '').trim()
    if (!addr) continue
    const t = new Date(job.created_at).getTime()
    if (!buckets[addr]) buckets[addr] = { recent: 0, older: 0 }
    if (t >= recentCutoff) buckets[addr].recent++
    else buckets[addr].older++
  }
  return buckets
}

export interface TrendResult {
  addr: string
  recent: number
  older: number
  ratio: number
}

// Finds the address with the highest recent/older ratio, among addresses
// that have at least MIN_RECENT_COUNT recent jobs and meet the TREND_RATIO
// threshold. Zero "older" jobs is treated as 1 (avoids div-by-zero while
// staying conservative about how strong the trend claim is).
export function findBestTrendingAddress(buckets: Record<string, AddressBucket>): TrendResult | null {
  let best: TrendResult | null = null
  for (const [addr, counts] of Object.entries(buckets)) {
    if (counts.recent < MIN_RECENT_COUNT) continue
    const olderAvg = Math.max(counts.older, 1)
    const ratio = counts.recent / olderAvg
    if (ratio >= TREND_RATIO && (!best || ratio > best.ratio)) {
      best = { addr, recent: counts.recent, older: counts.older, ratio }
    }
  }
  return best
}
