// ============================================================
// HAVERSINE DISTANCE
// Returns distance in kilometres between two lat/lng points.
// Used to trigger the 15-minute client SMS.
// ============================================================
export function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371 // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ============================================================
// GEOCODE ADDRESS -> { lat, lng }
// Converts a street address string into coordinates using Mapbox.
// Call this when a job is created so client_lat/client_lng are set.
// ============================================================
export async function geocodeAddress(address) {
  const token = import.meta.env.VITE_MAPBOX_TOKEN
  const encoded = encodeURIComponent(address)
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?country=AU&access_token=${token}`
  const res = await fetch(url)
  const data = await res.json()
  if (!data.features || data.features.length === 0) {
    throw new Error(`Could not geocode address: ${address}`)
  }
  const [lng, lat] = data.features[0].center
  return { lat, lng }
}

// ============================================================
// GENERATE PIN
// Creates a random 8-character alphanumeric PIN for technician login.
// (Not a numeric-only 6-digit PIN: with no rate limiting on the lookup,
// 900,000 combinations is brute-forceable. 8 chars from a 32-symbol
// alphabet, excluding visually ambiguous characters, gives ~1e12
// combinations while staying easy to read off a phone screen.)
// Uses crypto.getRandomValues (CSPRNG) rather than Math.random(), since
// this PIN is a real access-control boundary (see SECURITY_NOTES.md) and
// Math.random() is not cryptographically secure / predictable in some
// engines.
// ============================================================
const PIN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I
export function generatePin() {
  const randomValues = new Uint32Array(8)
  crypto.getRandomValues(randomValues)
  let pin = ''
  for (let i = 0; i < 8; i++) {
    pin += PIN_ALPHABET[randomValues[i] % PIN_ALPHABET.length]
  }
  return pin
}

// ============================================================
// GENERATE REFERRAL CODE
// Creates a random 6-character alphanumeric code for the Paid-Invoice
// Referral Loop (see markInvoicePaid in DispatcherView.jsx). Shorter than
// generatePin() on purpose — this isn't an access-control boundary like a
// technician PIN, it's a code a past client reads out over the phone or
// texts to a friend, so it's optimized for brevity/readability rather than
// combination space. Same CSPRNG approach and no-ambiguous-character
// alphabet as generatePin() for consistency.
// ============================================================
// ============================================================
// INSERT TECHNICIANS WITH PIN RETRY
// technicians.pin has a DB-level unique constraint (see
// supabase_schema_delta_pin_unique.sql) so that TechnicianView.jsx's
// global `.eq('pin', pin)` lookup (no business_id filter — the /tech?pin=X
// URL has no businessId to filter on) can never resolve to the wrong
// technician. generatePin()'s ~1e12 combination space makes a collision
// astronomically unlikely per call, but not impossible, so inserts retry
// with fresh PINs instead of surfacing a raw constraint-violation error.
// `rowsWithoutPin` is an array of technician fields (business_id, name,
// phone, etc.) with `pin` NOT yet set — this helper assigns it.
// ============================================================
export async function insertTechniciansWithPinRetry(supabase, rowsWithoutPin, maxAttempts = 5) {
  let lastError = null
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rows = rowsWithoutPin.map(r => ({ ...r, pin: generatePin() }))
    const { data, error } = await supabase.from('technicians').insert(rows).select()
    if (!error) return { data, error: null }
    lastError = error
    // 23505 = Postgres unique_violation. Anything else is a real error —
    // don't retry (and don't burn attempts) on e.g. a bad business_id.
    if (error.code !== '23505') break
  }
  return { data: null, error: lastError }
}

export function generateReferralCode() {
  const randomValues = new Uint32Array(6)
  crypto.getRandomValues(randomValues)
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += PIN_ALPHABET[randomValues[i] % PIN_ALPHABET.length]
  }
  return code
}

// ============================================================
// FORMAT TIME AGO
// Returns "3 mins ago", "just now", etc. for last_seen display.
// ============================================================
export function timeAgo(timestamptz) {
  if (!timestamptz) return 'never'
  const seconds = Math.floor((Date.now() - new Date(timestamptz)) / 1000)
  if (seconds < 30) return 'just now'
  if (seconds < 90) return '1 min ago'
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`
  return `${Math.floor(seconds / 3600)} hrs ago`
}

// ============================================================
// CLASSIFY SUPPORT REQUEST PRIORITY
// Used by ContactSupportModal.jsx to triage support_requests
// client-side with a simple keyword check (same "template
// classification, no AI needed" pattern as ai-intake-chat's
// EMERGENCY_KEYWORDS) so AdminConsole can surface urgent messages (a
// business that's down, can't get paid, or wants to cancel) ahead of
// routine ones — see supabase_schema_delta_support_priority.sql.
// ============================================================
export const URGENT_KEYWORDS = [
  'urgent', 'asap', 'down', "can't log in", 'cannot log in', "can't access",
  'cannot access', 'broken', 'not working', 'lost data', 'data missing',
  'charged twice', 'double charged', 'refund', 'cancel my', 'cancel the',
  'emergency', 'production', 'client is', 'losing money',
]
export function classifyPriority(message) {
  const lower = message.toLowerCase()
  return URGENT_KEYWORDS.some(kw => lower.includes(kw)) ? 'urgent' : 'normal'
}
