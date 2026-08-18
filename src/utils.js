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
// Creates a random 6-digit PIN for technician login.
// ============================================================
export function generatePin() {
  return String(Math.floor(100000 + Math.random() * 900000))
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
