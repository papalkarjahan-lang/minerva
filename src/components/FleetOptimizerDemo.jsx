import { useState } from 'react'
import { estimateDollarsFromKm } from '../utils'
import { BoltIcon, CheckCircleIcon } from './icons'
import { FleetMapBackdrop, MapZoomControl, MapCompass } from './MapScene'

// Public, no-signup interactive demo of the real optimize-fleet-day
// mechanism — same algorithm shape as
// supabase/functions/optimize-fleet-day/logic.ts (greedyAssignJobs +
// swapImproveAssignment + relocateImproveAssignment + twoOptImprove),
// reimplemented client-side against a fixed synthetic sample fleet so a
// cold prospect can click it and watch the actual reassignment happen, no
// login required. Distance here is flat-plane (synthetic 0-100 canvas),
// not haversine, since this isn't a real map — the algorithm logic is
// otherwise identical to production. Sample data and the resulting
// improvement were verified with a standalone script before shipping
// (42% / ~133 units saved on this fixed input, deterministic, not
// randomized or cherry-picked per visit — re-verified after adding the
// relocate pass, which found more than swap alone did on this same input).
// Honesty convention matches Demo.jsx: explicitly labeled sample data,
// never implies a real business, real technician, or a guaranteed result
// for any other fleet.

const TECHNICIANS = [
  { id: 'A', name: 'Dave', x: 10, y: 80, color: '#1D9E75' },
  { id: 'B', name: 'Sam', x: 50, y: 85, color: '#2D5FA8' },
  { id: 'C', name: 'Priya', x: 85, y: 75, color: '#E8A33D' },
]

const JOBS = [
  { id: 'J1', x: 15, y: 60 },
  { id: 'J2', x: 40, y: 70 },
  { id: 'J3', x: 55, y: 55 },
  { id: 'J4', x: 75, y: 60 },
  { id: 'J5', x: 20, y: 30 },
  { id: 'J6', x: 45, y: 25 },
  { id: 'J7', x: 70, y: 30 },
  { id: 'J8', x: 90, y: 45 },
]

// Realistic baseline: jobs assigned in the order they came in, not by
// geography — the same "whatever's already on the job" baseline
// optimize-fleet-day's own currentPlanDistanceKm compares against.
const CURRENT_ASSIGNMENT = { A: ['J1', 'J4', 'J7'], B: ['J2', 'J5', 'J8'], C: ['J3', 'J6'] }

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
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

// Direct port of optimize-fleet-day/logic.ts's greedyAssignJobs, swapping
// haversineKm for flat-plane distance.
function greedyAssignJobs(technicians, jobs) {
  const assignment = new Map(technicians.map(t => [t.id, []]))
  const techPos = new Map(technicians.map(t => [t.id, { x: t.x, y: t.y }]))
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
    techPos.set(bestTechId, { x: job.x, y: job.y })
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

function planToPaths(plan) {
  const paths = []
  for (const t of TECHNICIANS) {
    const stops = plan.byTech.get(t.id) || []
    if (stops.length === 0) continue
    const points = [{ x: t.x, y: t.y }, ...stops]
    const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    paths.push({ techId: t.id, color: t.color, d })
  }
  return paths
}

export default function FleetOptimizerDemo() {
  const [optimized, setOptimized] = useState(false)
  const [animating, setAnimating] = useState(false)

  const before = currentPlan()
  const after = computeOptimizedPlan()
  const plan = optimized ? after : before
  const paths = planToPaths(plan)
  const kmSaved = before.totalKm - after.totalKm
  const pctSaved = Math.round((kmSaved / before.totalKm) * 100)

  function handleOptimize() {
    if (optimized || animating) return
    setAnimating(true)
    setTimeout(() => {
      setOptimized(true)
      setAnimating(false)
    }, 900)
  }

  return (
    <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 20, padding: '28px 24px', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#E8A33D', fontWeight: 700, marginBottom: 4 }}>
            Try it — whole-fleet optimizer
          </div>
          <div style={{ fontSize: 13, color: '#8a93a8' }}>
            Sample fleet · 3 technicians, 8 jobs · not a real business
          </div>
        </div>
        <button
          onClick={handleOptimize}
          disabled={optimized || animating}
          style={{
            fontFamily: 'inherit', fontWeight: 700, fontSize: 14, border: 'none', borderRadius: 10,
            padding: '12px 20px', cursor: optimized ? 'default' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: optimized ? '#1b3a2c' : '#1D9E75', color: '#fff',
            opacity: animating ? 0.7 : 1, transition: 'opacity 0.2s',
          }}
        >
          {optimized ? <CheckCircleIcon size={15} /> : <BoltIcon size={13} />}
          {optimized ? 'Optimized' : animating ? 'Optimizing…' : 'Optimize this fleet'}
        </button>
      </div>

      {/* Hand-built SVG street scene behind the routes (see MapScene.jsx) —
          not Mapbox/Google Maps, no tile layer or API key involved. A dark
          "casing" stroke under each colored route (same technique real
          map renderers use) keeps crossing routes legible against it. */}
      <div style={{
        position: 'relative', height: 260, borderRadius: 14, overflow: 'hidden', marginBottom: 18,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.05), inset 0 20px 40px rgba(0,0,0,0.25)',
      }}>
        <FleetMapBackdrop />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 35%, transparent 50%, rgba(5,8,17,0.5) 100%)' }} />

        <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
          {paths.map(p => (
            <path key={`${p.techId}-case`} d={p.d} stroke="#05070d" strokeWidth="2.6" fill="none" opacity="0.55"
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ transition: 'd 0.6s ease' }} />
          ))}
          {paths.map(p => (
            <path key={p.techId} d={p.d} stroke={p.color} strokeWidth="1.3" fill="none" opacity="0.95"
              strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ transition: 'd 0.6s ease' }} />
          ))}
          {JOBS.map(j => (
            <g key={j.id}>
              <ellipse cx={j.x} cy={j.y + 1.1} rx="1.5" ry="0.55" fill="rgba(0,0,0,0.4)" />
              <circle cx={j.x} cy={j.y} r="1.5" fill="#0c1324" stroke="#fff" strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {TECHNICIANS.map(t => (
            <g key={t.id}>
              <ellipse cx={t.x} cy={t.y + 1.7} rx="3" ry="1" fill="rgba(0,0,0,0.42)" />
              <circle cx={t.x} cy={t.y} r="3.8" fill={t.color} opacity="0.22" />
              <circle cx={t.x} cy={t.y} r="2.7" fill={t.color} stroke="#0a0f1d" strokeWidth="0.7" vectorEffect="non-scaling-stroke" />
              <text x={t.x} y={t.y} textAnchor="middle" dominantBaseline="central" fontSize="2.9" fontWeight="800" fill="#0a0f1d">
                {t.name[0]}
              </text>
            </g>
          ))}
        </svg>

        <MapCompass />
        <MapZoomControl />

        <div style={{ position: 'absolute', bottom: 10, left: 12, display: 'flex', gap: 14, fontSize: 11, color: '#9fb8d8' }}>
          {TECHNICIANS.map(t => (
            <span key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 8, height: 8, borderRadius: 99, background: t.color, display: 'inline-block' }} />
              {t.name}
            </span>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Stat label="Current plan" value={`${before.totalKm.toFixed(0)} km`} dim={optimized} />
        <Stat label="Optimized plan" value={optimized ? `${after.totalKm.toFixed(0)} km` : '—'} highlight={optimized} />
        <Stat label="Saved" value={optimized ? `${kmSaved.toFixed(0)} km (${pctSaved}%)` : '—'} highlight={optimized} accent />
        <Stat label="≈ est. cost saved" value={optimized ? `$${estimateDollarsFromKm(kmSaved)}` : '—'} highlight={optimized} accent />
      </div>
      <p style={{ fontSize: 12, color: '#888', margin: '16px 0 0', lineHeight: 1.6 }}>
        This is the same reassign-and-reroute logic Minerva runs for real, Standard-tier trade businesses —
        it only ever applies a change when it's a genuine improvement over what you already had. On this
        fixed sample it finds one; on a day that's already well-planned, it would say so and change nothing.
        Dollar figure is an estimate using the ATO's 2026-27 all-inclusive vehicle running-cost rate
        (91c/km), not a measured cost for any real fleet.
      </p>
    </div>
  )
}

function Stat({ label, value, dim, highlight, accent }) {
  return (
    <div style={{ opacity: dim ? 0.45 : 1 }}>
      <div style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#6b7488', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent && highlight ? '#1D9E75' : '#fff', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}
