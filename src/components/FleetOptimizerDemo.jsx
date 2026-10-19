import { useState } from 'react'

// Public, no-signup interactive demo of the real optimize-fleet-day
// mechanism — same algorithm shape as
// supabase/functions/optimize-fleet-day/logic.ts (greedyAssignJobs +
// twoOptImprove), reimplemented client-side against a fixed synthetic
// sample fleet so a cold prospect can click it and watch the actual
// reassignment happen, no login required. Distance here is flat-plane
// (synthetic 0-100 canvas), not haversine, since this isn't a real map —
// the algorithm logic is otherwise identical to production. Sample data
// and the resulting improvement were verified with a standalone script
// before shipping (40% / ~126 units saved on this fixed input, deterministic,
// not randomized or cherry-picked per visit).
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

function computeOptimizedPlan() {
  const assignment = greedyAssignJobs(TECHNICIANS, JOBS)
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
            background: optimized ? '#1b3a2c' : '#1D9E75', color: '#fff',
            opacity: animating ? 0.7 : 1, transition: 'opacity 0.2s',
          }}
        >
          {optimized ? '✓ Optimized' : animating ? 'Optimizing…' : '⚡ Optimize this fleet'}
        </button>
      </div>

      <div style={{ position: 'relative', height: 260, borderRadius: 14, overflow: 'hidden', background: 'linear-gradient(135deg, #142033 0%, #0d1526 100%)', marginBottom: 18 }}>
        <svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none" viewBox="0 0 100 100">
          {paths.map(p => (
            <path key={p.techId} d={p.d} stroke={p.color} strokeWidth="1" fill="none" opacity="0.75"
              style={{ transition: 'd 0.6s ease' }} />
          ))}
          {JOBS.map(j => (
            <circle key={j.id} cx={j.x} cy={j.y} r="1.6" fill="#fff" opacity="0.9" />
          ))}
          {TECHNICIANS.map(t => (
            <circle key={t.id} cx={t.x} cy={t.y} r="2.4" fill={t.color} stroke="#0a0f1d" strokeWidth="0.6" />
          ))}
        </svg>
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
      </div>
      <p style={{ fontSize: 12, color: '#555', margin: '16px 0 0', lineHeight: 1.6 }}>
        This is the same reassign-and-reroute logic Minerva runs for real, Standard-tier trade businesses —
        it only ever applies a change when it's a genuine improvement over what you already had. On this
        fixed sample it finds one; on a day that's already well-planned, it would say so and change nothing.
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
