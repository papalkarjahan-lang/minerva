import { useState } from 'react'

// Public, no-signup savings estimator — lets a cold prospect self-qualify
// with their own fleet size before ever talking to anyone. Uses the exact
// same cited numbers already used on the real closing document
// (generate-roi-proposal/logic.ts's CONSERVATIVE_FUEL_SAVINGS_RATE and
// ESTIMATED_FUEL_SPEND_PER_VEHICLE_MONTHLY), not a new figure invented for
// this page — see that file's own header for the full research/honesty
// rationale (a cited route-optimization fuel-savings benchmark, trade
// sector only; industrial has no route-optimization feature and isn't
// covered by this estimate).
const CONSERVATIVE_FUEL_SAVINGS_RATE = 0.15
const ESTIMATED_FUEL_SPEND_PER_VEHICLE_MONTHLY = 1200

export default function SavingsEstimator() {
  const [fleetSize, setFleetSize] = useState(5)
  const [customSpend, setCustomSpend] = useState('')

  const monthlyFuelSpend = (customSpend && Number(customSpend) > 0)
    ? Number(customSpend)
    : fleetSize * ESTIMATED_FUEL_SPEND_PER_VEHICLE_MONTHLY
  const monthlySavings = Math.round(monthlyFuelSpend * CONSERVATIVE_FUEL_SAVINGS_RATE)
  const annualSavings = monthlySavings * 12

  return (
    <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: '26px 24px' }}>
      <p style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#1D9E75', fontWeight: 'bold', margin: '0 0 6px' }}>
        Estimate your savings — trade sector, whole-fleet route optimization
      </p>
      <p style={{ fontSize: 13, color: '#777', margin: '0 0 20px', lineHeight: 1.6 }}>
        A conservative, cited industry estimate — not a measured result for any specific business, since Minerva doesn't have
        enough live customers yet to report a real average. Adjust the numbers to match your own fleet.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginBottom: 20 }}>
        <label style={{ flex: '1 1 180px', fontSize: 13, color: '#aaa' }}>
          Technicians / vehicles
          <input
            type="number" min="1" max="500" value={fleetSize}
            onChange={e => setFleetSize(Math.max(1, Number(e.target.value) || 1))}
            style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #2a3449', background: '#0f1420', color: '#fff', fontSize: 15, boxSizing: 'border-box' }}
          />
        </label>
        <label style={{ flex: '1 1 220px', fontSize: 13, color: '#aaa' }}>
          Your actual monthly fuel spend (optional)
          <input
            type="number" min="0" placeholder={`default: ~$${(fleetSize * ESTIMATED_FUEL_SPEND_PER_VEHICLE_MONTHLY).toLocaleString()}`}
            value={customSpend} onChange={e => setCustomSpend(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 8, border: '1px solid #2a3449', background: '#0f1420', color: '#fff', fontSize: 15, boxSizing: 'border-box' }}
          />
        </label>
      </div>

      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', borderTop: '1px solid #1e293b', paddingTop: 18 }}>
        <div>
          <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Est. monthly savings</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1D9E75' }}>${monthlySavings.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Est. annual savings</div>
          <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1D9E75' }}>${annualSavings.toLocaleString()}</div>
        </div>
      </div>
      <p style={{ fontSize: 11, color: '#555', margin: '16px 0 0', lineHeight: 1.6 }}>
        Based on a conservative 15% fuel-savings benchmark cited for route optimization, applied to an estimated $1,200/month
        average fuel spend per vehicle when you don't enter your own. Trade sector only — this feature isn't available for
        Industrial-sector accounts.
      </p>
    </div>
  )
}
