// Shared suburb-extraction/ranking logic, used by both daily-digest and
// generate-growth-drafts (previously each had its own near-identical
// inline copy). Kept dependency-free (no Deno/Supabase imports) on purpose
// — every function here is a plain, synchronous, side-effect-free
// calculation over plain data, so it can be unit-tested with Vitest and
// imported unchanged into either Deno edge function.

// Uses the last comma-separated segment of a client_address as a rough
// suburb proxy (this schema has no dedicated suburb column on jobs, and
// client_address is free text typed by a dispatcher at job creation —
// see DispatcherView.jsx's Add Job form — never geocoded/normalized
// before being stored). Returns null for a blank/missing address or a
// trailing segment that's empty after trimming (e.g. a trailing comma).
//
// Hardened 2026-10-03: this feeds daily-digest's "top suburb" line (shown
// to every business owner, every day they have completed jobs) and
// generate-growth-drafts' marketing copy — real estate doesn't move, so
// this was silently wrong on every single run for any business whose
// dispatchers type addresses as "123 Main St, Parramatta NSW 2150" (state
// + postcode in the SAME segment as the suburb, no comma before the
// state) — an extremely common Australian address format, not an edge
// case. The naive "last comma segment" returned "Parramatta NSW 2150"
// as the "suburb", and the original test suite had actually encoded that
// wrong behaviour as the expected result rather than catching it.
// Now also handles "123 Main St, Parramatta, NSW 2150" (comma BEFORE the
// state too) by falling back to the second-to-last segment when the last
// one is nothing but a state+postcode (or bare postcode) with no suburb
// text of its own. A bare state with no postcode (rare — postcodes are
// near-universal in real entry) isn't stripped; that's an accepted,
// documented remaining gap rather than something this tries to guess at.
const AU_STATES = 'NSW|VIC|QLD|WA|SA|TAS|ACT|NT'
const STATE_POSTCODE_SUFFIX = new RegExp(`\\s+(?:${AU_STATES})\\s+\\d{4}\\s*$`, 'i')
const STATE_POSTCODE_ONLY = new RegExp(`^(?:${AU_STATES})\\s+\\d{4}$`, 'i')
const POSTCODE_ONLY = /^\d{4}$/

// Guards against a real, measured DoS in STATE_POSTCODE_SUFFIX — found
// live (scale-readiness pass, 2026-10-08): tested against a long
// non-matching string (no start anchor, so the regex engine retries its
// \s+ backtracking from every position in the string), its running time
// grows roughly quadratically, not linearly — a 50,000-character
// adversarial input measured over 2 full seconds on a single synchronous
// regex test. client_address is reachable from the fully public,
// unauthenticated intake chat widget and TrackingView's rebooking flow,
// and extractSuburb runs inside daily-digest/generate-growth-drafts, both
// cron sweeps across every business. A real Australian suburb name or
// state+postcode suffix is never anywhere near this long, so skipping
// extraction entirely above this length can't affect any legitimate
// address — it only short-circuits the attack shape.
const MAX_SUBURB_SEGMENT_LENGTH = 200

export function extractSuburb(address: string | null | undefined): string | null {
  if (!address) return null
  const segments = address.split(',')
  const last = (segments.pop() || '').trim()
  if (!last) return null
  if (last.length > MAX_SUBURB_SEGMENT_LENGTH) return null

  if ((STATE_POSTCODE_ONLY.test(last) || POSTCODE_ONLY.test(last)) && segments.length > 0) {
    // The trailing segment is nothing but a state/postcode — the real
    // suburb is the one before it ("street, suburb, STATE POSTCODE").
    const previous = (segments.pop() || '').trim()
    return previous || null
  }

  // Otherwise strip a trailing " STATE POSTCODE" suffix if the suburb and
  // state+postcode were typed as one segment with no comma between them.
  const stripped = last.replace(STATE_POSTCODE_SUFFIX, '').trim()
  return stripped || null
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
