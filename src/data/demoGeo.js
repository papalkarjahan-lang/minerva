// Real geographic data for the public /demo page's two interactive
// widgets, now that VITE_MAPBOX_TOKEN holds a real token (verified
// 2026-10-30 — see Map3D.jsx). Everything here is a real, valid Sydney
// coordinate and (for the phone route) an actual Mapbox Directions
// response, not placeholder numbers — but the people, business, and job
// behind them are still fully fictional, same honesty rule as before:
// real map, simulated story.

// PHONE DEMO — a real ~1km driving route in Surry Hills/Sydney, fetched
// once from the Mapbox Directions API (driving profile) and hardcoded
// here so every visitor gets the same fast, free, deterministic demo
// instead of this page making a live routing call on every load.
// Verified live: 992.5m, 283s, 48-point LineString, waypoint names
// "Cleveland Avenue" -> "Sheas Lane" (both real Surry Hills streets).
export const PHONE_ROUTE_START = { lat: -33.890803, lng: 151.212317 }
export const PHONE_ROUTE_END = { lat: -33.88451, lng: 151.21466 }
export const PHONE_ROUTE_DISTANCE_M = 992.5
export const PHONE_ROUTE_DURATION_S = 283
export const PHONE_ROUTE_COORDS = [
  [151.212317, -33.890803], [151.212187, -33.891388], [151.212171, -33.891457], [151.212388, -33.891487],
  [151.212502, -33.891503], [151.212534, -33.891508], [151.212731, -33.891534], [151.21281, -33.891454],
  [151.212824, -33.891438], [151.212873, -33.891185], [151.21308, -33.890098], [151.213089, -33.890055],
  [151.213104, -33.889986], [151.213213, -33.889437], [151.213309, -33.888965], [151.213313, -33.888943],
  [151.213322, -33.888896], [151.213331, -33.888852], [151.213337, -33.888822], [151.213343, -33.888783],
  [151.213353, -33.888719], [151.213359, -33.88869], [151.213371, -33.888629], [151.213493, -33.888031],
  [151.213513, -33.887919], [151.213575, -33.887604], [151.213615, -33.887392], [151.21368, -33.887045],
  [151.2137, -33.88694], [151.213712, -33.886878], [151.213717, -33.886851], [151.213761, -33.88663],
  [151.21384, -33.886205], [151.213855, -33.886131], [151.213884, -33.885988], [151.213973, -33.885527],
  [151.214029, -33.885236], [151.214033, -33.885211], [151.214051, -33.88512], [151.214067, -33.88504],
  [151.214072, -33.885013], [151.214088, -33.884925], [151.214186, -33.884407], [151.214247, -33.88445],
  [151.21427, -33.88446], [151.214596, -33.884598], [151.214634, -33.884615], [151.21466, -33.88451],
]

// FLEET DEMO — three technician start points and eight jobs across real
// inner-to-outer Sydney suburbs (Parramatta in the west to a stretch of
// the eastern suburbs, ~27km span), so distances come from real-world
// haversine geometry (same haversineKm() production's own optimizer
// uses) instead of an abstract flat-plane canvas. The spatial layout
// mirrors the original synthetic demo's deliberately-illustrative
// topology (each tech starts near one cluster of jobs; the "current"
// assignment below scrambles them anyway, the way jobs really do land
// on whoever's free rather than whoever's closest) — reran through the
// real algorithm against these real coordinates and verified by a
// standalone script before shipping: 74.9km -> 40.4km, 46% / ~34.5km
// saved, not cherry-picked or rounded up.
export const TECHNICIANS = [
  { id: 'A', name: 'Dave', lat: -33.916, lng: 151.01, color: '#1D9E75' },
  { id: 'B', name: 'Sam', lat: -33.9245, lng: 151.13, color: '#2D5FA8' },
  { id: 'C', name: 'Priya', lat: -33.9075, lng: 151.235, color: '#E8A33D' },
]

export const JOBS = [
  { id: 'J1', lat: -33.882, lng: 151.025 },
  { id: 'J2', lat: -33.899, lng: 151.1 },
  { id: 'J3', lat: -33.8735, lng: 151.145 },
  { id: 'J4', lat: -33.882, lng: 151.205 },
  { id: 'J5', lat: -33.831, lng: 151.04 },
  { id: 'J6', lat: -33.8225, lng: 151.115 },
  { id: 'J7', lat: -33.831, lng: 151.19 },
  { id: 'J8', lat: -33.8565, lng: 151.25 },
]

// "Whatever's already on the job" baseline — intake order, not
// geography. Same shape as before, now sitting on real coordinates.
export const CURRENT_ASSIGNMENT = { A: ['J1', 'J4', 'J7'], B: ['J2', 'J5', 'J8'], C: ['J3', 'J6'] }

// Centers the fleet map so all three technicians and all eight jobs are
// comfortably in frame at the initial zoom.
export const FLEET_MAP_CENTER = { lat: -33.876, lng: 151.13 }
