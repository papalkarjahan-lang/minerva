// Shared suburb-extraction/ranking logic, used by both daily-digest and
// generate-growth-drafts (previously each had its own near-identical
// inline copy). Kept dependency-free (no Deno/Supabase imports) on purpose
// — every function here is a plain, synchronous, side-effect-free
// calculation over plain data, so it can be unit-tested with Vitest and
// imported unchanged into either Deno edge function.

// Uses the last comma-separated segment of a client_address as a rough
// suburb proxy (this schema has no dedicated suburb column on jobs).
// Returns null for a blank/missing address or a trailing segment that's
// empty after trimming (e.g. a trailing comma).
export function extractSuburb(address: string | null | undefined): string | null {
  if (!address) return null
  const suburb = (address.split(',').pop() || '').trim()
  return suburb || null
}

export interface JobWithAddress {
  client_address: string | null | undefined
}

// Ranks suburbs by completed-job count, descending. Ties keep their
// original Object.entries insertion order (first-seen suburb wins).
export function rankSuburbsByJobCount(jobs: JobWithAddress[]): [string, number][] {
  const counts: Record<string, number> = {}
  for (const j of jobs) {
    const suburb = extractSuburb(j.client_address)
    if (!suburb) continue
    counts[suburb] = (counts[suburb] || 0) + 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])
}
