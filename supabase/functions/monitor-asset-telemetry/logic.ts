// Pure geofence/maintenance-threshold logic for monitor-asset-telemetry,
// extracted out of index.ts so it can be unit-tested with Vitest (edge
// functions themselves can't be imported into a Node test runner).
// index.ts imports these same functions, so this file IS the production
// logic, not a reimplementation.
//
// Kept dependency-free (no Deno/Supabase imports) on purpose — every
// function here is a plain, synchronous, side-effect-free calculation over
// plain data.

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (d: number) => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export interface GeofenceCheck {
  breached: boolean
  distanceMeters: number
}

// Defaults the geofence radius to 200m when a site has none set, matching
// index.ts's existing `site.geofence_radius_m || 200` behaviour exactly.
export function checkGeofence(lat: number, lng: number, siteLat: number, siteLng: number, radiusM: number | null | undefined): GeofenceCheck {
  const distanceMeters = haversineMeters(lat, lng, siteLat, siteLng)
  return { breached: distanceMeters > (radiusM || 200), distanceMeters }
}

// Defaults the maintenance interval to 250h when unset, matching
// index.ts's existing `asset.maintenance_interval_hours || 250` behaviour.
export function isMaintenanceDue(engineHours: number, lastMaintenanceAtHours: number | null | undefined, maintenanceIntervalHours: number | null | undefined): boolean {
  const dueAt = (lastMaintenanceAtHours || 0) + (maintenanceIntervalHours || 250)
  return engineHours >= dueAt
}
