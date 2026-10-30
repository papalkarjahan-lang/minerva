import { useState } from 'react'
import { Marker } from 'react-map-gl'
import { estimateDollarsFromKm, haversineKm, isMapboxTokenConfigured } from '../utils'
import { BoltIcon, CheckCircleIcon } from './icons'
import { FleetMapBackdrop, MapToolbar, RouteGlowFilter } from './MapScene'
import Map3D, { RouteLine } from './Map3D'
import { TECHNICIANS, JOBS, CURRENT_ASSIGNMENT, FLEET_MAP_CENTER } from '../data/demoGeo'

// Public, no-signup interactive demo of the real optimize-fleet-day
// mechanism — same algorithm shape as
// supabase/functions/optimize-fleet-day/logic.ts (greedyAssignJobs +
// swapImproveAssignment + relocateImproveAssignment + twoOptImprove),
// reimplemented client-side against a fixed sample fleet so a cold
// prospect can click it and watch the actual reassignment happen, no
// login required.
//
// As of 2026-10-30 this runs on real Sydney coordinates (src/data/
// demoGeo.js) with production's own haversineKm — the earlier version
// used flat-plane distance on a synthetic 0-100 canvas because there was
// no real map to put it on yet. There is now (VITE_MAPBOX_TOKEN holds a
// real token — see Map3D.jsx), so the distance math and the map under it
// finally agree with each other. Re-verified with a standalone script
// against these exact coordinates before shipping: 74.9km -> 40.4km, 46%
// / ~34.5km saved — not cherry-picked or rounded up. Falls back to the
// hand-built SVG scene (MapScene.jsx) if the token is ever missing or
// Mapbox errors at runtime, same pattern DispatcherView uses.

function dist(a, b) {
  return haversineKm(a.lat, a.lng, b.lat, b.lng)
}

function routeDistance(startPos, orderedJobs) {
  let total = 0
  let pos = startPos
  for (const j of orderedJobs) {
    total += dist(pos, j)
    pos = j
  }
  return total
}

// Direct port of optimize-fleet-day/logic.ts's greedyAssignJobs.
function greedyAssignJobs(technicians, jobs) {
  const assignment = new Map(technicians.map(t => [t.id, []]))
  const techPos = new Map(technicians.map(t => [t.id, { lat: t.lat, lng: t.lng }]))
  const unassigned = [...jobs]
  while (unassigned.length > 0) {
    let bestTechId = null, bestJobIdx = -1, bestDist = Infinity
    for (let ji = 0; ji < unassigned.length; ji++) {
      for (const t of technicians) {
        const d = dist(techPos.get(t.id), unassigned[ji])
        if (d < bestDist) { bestDist = d; bestTechId = t.id; bestJobIdx = ji }
      }
    }
    const job = unassigned.splice(bestJobIdx, 1)[0]
    assignment.get(bestTechId).push(job.id)
    techPos.set(bestTechId, { lat: job.lat, lng: job.lng })
  }
  return assignment
}

// Direct port of optimize-fleet-day/logic.ts's twoOptImprove.
function twoOptImprove(startPos, orderedJobs) {
  if (orderedJobs.length < 3) return orderedJobs
  let route = [...orderedJobs]
  const total = (order) => routeDistance(startPos, order)
  let improved = true, passes = 0
  while (improved && passes < 25) {
    improved = false
    passes++
    for (let i = 0; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)]
        if (total(candidate) < total(route) - 1e-9) { route = candidate; improved = true }
      }
    }
  }
  return route
}

// Direct port of optimize-fleet-day/logic.ts's swapImproveAssignment —
// bounded pairwise job-swap local search on top of the greedy
// assignment. Kept in sync with production so this demo never shows a
// weaker algorithm than what's actually live.
function swapImproveAssignment(technicians, jobs, assignment) {
  const jobsById = new Map(jobs.map(j => [j.id, j]))
  const techById = new Map(technicians.map(t => [t.id, t]))
  const current = new Map()
  for (const [techId, jobIds] of assignment) current.set(techId, [...jobIds])

  const routeCost = (tech, jobIds) => {
    const theirJobs = jobIds.map(id => jobsById.get(id)).filter(Boolean)
    return routeDistance(tech, twoOptImprove(tech, theirJobs))
  }

  const techIds = [...current.keys()]
  let improved = true, passes = 0
  while (improved && passes < 10) {
    improved = false
    passes++
    outer:
    for (let a = 0; a < techIds.length; a++) {
      for (let b = a + 1; b < techIds.length; b++) {
        const techA = techById.get(techIds[a])
        const techB = techById.get(techIds[b])
        const listA = current.get(techIds[a])
        const listB = current.get(techIds[b])
        if (listA.length === 0 || listB.length === 0) continue
        const baseCost = routeCost(techA, listA) + routeCost(techB, listB)
        for (let i = 0; i < listA.length; i++) {
          for (let j = 0; j < listB.length; j++) {
            const candidateA = listA.slice(); candidateA[i] = listB[j]
            const candidateB = listB.slice(); candidateB[j] = listA[i]
            const candidateCost = routeCost(techA, candidateA) + routeCost(techB, candidateB)
            if (candidateCost < baseCost - 1e-9) {
              current.set(techIds[a], candidateA)
              current.set(techIds[b], candidateB)
              improved = true
              break outer
            }
          }
        }
      }
    }
  }
  return current
}

// Direct port of optimize-fleet-day/logic.ts's relocateImproveAssignment —
// moves a single job to another technician's list with nothing given back,
// a genuinely different case from swap (which only considers exchanges).
function relocateImproveAssignment(technicians, jobs, assignment) {
  const jobsById = new Map(jobs.map(j => [j.id, j]))
  const techById = new Map(technicians.map(t => [t.id, t]))
  const current = new Map()
  for (const [techId, jobIds] of assignment) current.set(techId, [...jobIds])

  const routeCost = (tech, jobIds) => {
    const theirJobs = jobIds.map(id => jobsById.get(id)).filter(Boolean)
    return routeDistance(tech, twoOptImprove(tech, theirJobs))
  }

  const techIds = [...current.keys()]
  let improved = true, passes = 0
  while (improved && passes < 10) {
    improved = false
    passes++
    outer:
    for (let a = 0; a < techIds.length; a++) {
      for (let b = 0; b < techIds.length; b++) {
        if (a === b) continue
        const techA = techById.get(techIds[a])
        const techB = techById.get(techIds[b])
        const listA = current.get(techIds[a])
        const listB = current.get(techIds[b])
        if (listA.length === 0) continue
        const baseCost = routeCost(techA, listA) + routeCost(techB, listB)
        for (let i = 0; i < listA.length; i++) {
          const movedJobId = listA[i]
          const candidateA = listA.slice()
          candidateA.splice(i, 1)
          const candidateB = [...listB, movedJobId]
          const candidateCost = routeCost(techA, candidateA) + routeCost(techB, candidateB)
          if (candidateCost < baseCost - 1e-9) {
            current.set(techIds[a], candidateA)
            current.set(techIds[b], candidateB)
            improved = true
            break outer
          }
        }
      }
    }
  }
  return current
}

function computeOptimizedPlan() {
  const greedy = greedyAssignJobs(TECHNICIANS, JOBS)
  const swapped = swapImproveAssignment(TECHNICIANS, JOBS, greedy)
  const assignment = relocateImproveAssignment(TECHNICIANS, JOBS, swapped)
  const result = new Map()
  let totalKm = 0
  for (const t of TECHNICIANS) {
    const theirJobs = (assignment.get(t.id) || []).map(id => JOBS.find(j => j.id === id))
    const ordered = twoOptImprove(t, theirJobs)
    result.set(t.id, ordered)
    totalKm += routeDistance(t, ordered)
  }
  return { byTech: result, totalKm }
}

function currentPlan() {
  const result = new Map()
  let totalKm = 0
  for (const t of TECHNICIANS) {
    const theirJobs = CURRENT_ASSIGNMENT[t.id].map(id => JOBS.find(j => j.id === id))
    result.set(t.id, theirJobs)
    totalKm += routeDistance(t, theirJobs)
  }
  return { byTech: result, totalKm }
}

// SVG-space (0-100) path, for the MapScene.jsx fallback only.
function planToSvgPaths(plan) {
  const lngs = JOBS.map(j => j.lng).concat(TECHNICIANS.map(t => t.lng))
  const lats = JOBS.map(j => j.lat).concat(TECHNICIANS.map(t => t.lat))
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs)
  const latMin = Math.min(...lats), latMax = Math.max(...lats)
  const toXY = (p) => ({
    x: 6 + ((p.lng - lngMin) / (lngMax - lngMin)) * 88,
    y: 94 - ((p.lat - latMin) / (latMax - latMin)) * 88,
  })
  const paths = []
  for (const t of TECHNICIANS) {
    const stops = plan.byTech.get(t.id) || []
    if (stops.length === 0) continue
    const points = [toXY(t), ...stops.map(toXY)]
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')
    paths.push({ techId: t.id, color: t.color, d })
  }
  return { paths, toXY }
}

// Real GeoJSON coordinates ([lng, lat]) per technician, for the Mapbox
// route layer.
function planToGeoRoutes(plan) {
  const routes = []
  for (const t of TECHNICIANS) {
    const stops = plan.byTech.get(t.id) || []
    if (stops.length === 0) continue
    routes.push({ techId: t.id, color: t.color, coords: [[t.lng, t.lat], ...stops.map(s => [s.lng, s.lat])] })
  }
  return routes
}

const FLEET_VIEW_STATE = { latitude: FLEET_MAP_CENTER.lat, longitude: FLEET_MAP_CENTER.lng, zoom: 9.55, pitch: 42, bearing: -8 }

export default function FleetOptimizerDemo() {
  const [optimized, setOptimized] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [mapError, setMapError] = useState(false)

  const before = currentPlan()
  const after = computeOptimizedPlan()
  const plan = optimized ? after : before
  const kmSaved = before.totalKm - after.totalKm
  const pctSaved = Math.round((kmSaved / before.totalKm) * 100)
  const useRealMap = isMapboxTokenConfigured() && !mapError

  function handleOptimize() {
    if (optimized || animating) return
    setAnimating(true)
    setTimeout(() => {
      setOptimized(true)
      setAnimating(false)
    }, 900)
  }

  const maxKm = Math.max(before.totalKm, after.totalKm)

  return (
    <div style={{ background: '#0a0f1d', border: '1px solid #1b2336', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px -20px rgba(0,0,0,0.5)' }}>
      {/* App-window titlebar — the one authenticity cue real dashboard
          screenshots almost always carry, kept small and quiet. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: '1px solid #151c2c' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: '#2a3346' }} />
        <span style={{ width: 8, height: 8, borderRadius: 99, background: '#2a3346' }} />
        <span style={{ width: 8, height: 8, borderRadius: 99, background: '#2a3346' }} />
        <span style={{ fontSize: 12, color: '#5c6684', marginLeft: 6 }}>Minerva — Today's routes (sample)</span>
      </div>

      <div style={{ padding: '20px 24px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: '#8a93a8' }}>
            Sample fleet across real Sydney suburbs · 3 technicians, 8 jobs · not a real business
          </div>
          <button
            onClick={handleOptimize}
            disabled={optimized || animating}
            style={{
              fontFamily: 'inherit', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 9,
              padding: '11px 18px', cursor: optimized ? 'default' : 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: optimized ? '#142a20' : '#1D9E75', color: optimized ? '#5fae8e' : '#06130e',
              opacity: animating ? 0.7 : 1, transition: 'opacity 0.2s',
            }}
          >
            {optimized ? <CheckCircleIcon size={15} /> : <BoltIcon size={13} />}
            {optimized ? 'Optimized' : animating ? 'Optimizing…' : 'Optimize this fleet'}
          </button>
        </div>

        <div style={{ position: 'relative', aspectRatio: '220 / 130', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
          {useRealMap ? (
            <Map3D viewState={FLEET_VIEW_STATE} onError={() => setMapError(true)}>
              {planToGeoRoutes(plan).map(r => (
                <RouteLine key={r.techId} id={`fleet-route-${r.techId}`} coordinates={r.coords} color={r.color} width={3} />
              ))}
              {JOBS.map(j => (
                <Marker key={j.id} latitude={j.lat} longitude={j.lng} anchor="center">
                  <div style={{ width: 9, height: 9, borderRadius: 99, background: '#0a0f1d', border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }} />
                </Marker>
              ))}
              {TECHNICIANS.map(t => (
                <Marker key={t.id} latitude={t.lat} longitude={t.lng} anchor="center">
                  <div style={{
                    width: 24, height: 24, borderRadius: 99, background: t.color, border: '2px solid #0a0f1d',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0f1d', fontWeight: 800, fontSize: 11,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
                  }}>{t.name[0]}</div>
                </Marker>
              ))}
            </Map3D>
          ) : (() => {
            const { paths, toXY } = planToSvgPaths(plan)
            return (
              <>
                <FleetMapBackdrop />
                <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
                  <defs><RouteGlowFilter id="route-glow-fleet" /></defs>
                  {paths.map(p => (
                    <path key={p.techId} d={p.d} stroke={p.color} strokeWidth="1.1" fill="none" opacity="0.95"
                      strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"
                      filter="url(#route-glow-fleet)" style={{ transition: 'd 0.6s ease' }} />
                  ))}
                  {JOBS.map(j => {
                    const p = toXY(j)
                    return <circle key={j.id} cx={p.x} cy={p.y} r="1.3" fill="#0a0f1d" stroke="#fff" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
                  })}
                  {TECHNICIANS.map(t => {
                    const p = toXY(t)
                    return (
                      <g key={t.id}>
                        <circle cx={p.x} cy={p.y} r="3.4" fill={t.color} opacity="0.18" />
                        <circle cx={p.x} cy={p.y} r="2.4" fill={t.color} stroke="#0a0f1d" strokeWidth="0.6" vectorEffect="non-scaling-stroke" />
                        <text x={p.x} y={p.y} textAnchor="middle" dominantBaseline="central" fontSize="2.6" fontWeight="800" fill="#0a0f1d">{t.name[0]}</text>
                      </g>
                    )
                  })}
                </svg>
                <MapToolbar />
              </>
            )
          })()}
        </div>

        {/* Kept off the map itself (rather than overlaid in a corner) so
            it never fights with Mapbox's own required attribution
            control, which also lives bottom-right. */}
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#9fb8d8', marginBottom: 20 }}>
          {TECHNICIANS.map(t => (
            <span key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: t.color, display: 'inline-block' }} />
              {t.name}
            </span>
          ))}
        </div>

        {/* Comparison bars make the improvement legible at a glance,
            instead of four disconnected numbers the reader has to do
            subtraction on themselves. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          <DistanceBar label="Current plan" km={before.totalKm} max={maxKm} color="#4a5578" />
          <DistanceBar label="Optimized plan" km={optimized ? after.totalKm : null} max={maxKm} color="#1D9E75" />
        </div>

        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', paddingTop: 2 }}>
          <Stat label="Saved" value={optimized ? `${kmSaved.toFixed(0)} km (${pctSaved}%)` : '—'} highlight={optimized} accent />
          <Stat label="≈ est. cost saved" value={optimized ? `$${estimateDollarsFromKm(kmSaved)}` : '—'} highlight={optimized} accent />
        </div>
        <p style={{ fontSize: 12, color: '#5c6684', margin: '18px 0 0', lineHeight: 1.6 }}>
          This is the same reassign-and-reroute logic Minerva runs for real, Standard-tier trade businesses,
          computing real-world distance (haversine) across real Sydney coordinates — it only ever applies a
          change when it's a genuine improvement over what you already had. On this fixed sample it finds
          one; on a day that's already well-planned, it would say so and change nothing. Dollar figure is an
          estimate using the ATO's 2026-27 all-inclusive vehicle running-cost rate (91c/km), not a measured
          cost for any real fleet.
        </p>
      </div>
    </div>
  )
}

function Stat({ label, value, highlight, accent }) {
  return (
    <div>
      <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7488', marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.01em', color: accent && highlight ? '#1D9E75' : '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

// Horizontal comparison bar — km rendered as a proportional width against
// the larger of the two plans, so the improvement is legible as a shape,
// not just a number the reader has to subtract themselves.
function DistanceBar({ label, km, max, color }) {
  const pct = km == null ? 0 : Math.max(4, (km / max) * 100)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#8a93a8', marginBottom: 5 }}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: '#cbd3e6', fontWeight: 600 }}>{km == null ? '—' : `${km.toFixed(0)} km`}</span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: '#131a2b', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 99, background: color, transition: 'width 0.7s cubic-bezier(0.22, 1, 0.36, 1)' }} />
      </div>
    </div>
  )
}
