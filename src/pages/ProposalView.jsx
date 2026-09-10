import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Public, read-only ROI proposal page — see generate-roi-proposal/index.ts
// for how the numbers are calculated and generate-roi-proposal's header
// comment for the specific benchmark sources. Unguessable-UUID-as-bearer-
// token access, same pattern as QuoteView/InvoiceView (see
// SECURITY_NOTES.md). Nothing on this page lets a viewer write anything —
// unlike QuoteView, there's no Accept/Decline action here; a real
// multi-technician deal like this is closed by a human conversation, not
// a self-serve button.
export default function ProposalView() {
  const { proposalId } = useParams()
  const [proposal, setProposal] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { loadProposal() }, [proposalId])

  async function loadProposal() {
    const { data, error: err } = await supabase
      .from('roi_proposals').select('*').eq('id', proposalId).single()
    if (err || !data) { setError('This proposal link is invalid.'); return }
    setProposal(data)
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}><p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p></div>
    </div>
  )
  if (!proposal) return (
    <div style={styles.screen}><p style={{ color: '#888', fontSize: 16 }}>Loading...</p></div>
  )

  const fmt = n => Number(n).toLocaleString('en-AU', { maximumFractionDigits: 0 })

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <p style={styles.bizName}>Prepared for {proposal.company_name}</p>
        <h1 style={styles.title}>What Minerva could save your fleet</h1>
        <p style={styles.subtitle}>
          Based on a {proposal.fleet_size}-vehicle fleet{proposal.trade_type ? ` in ${proposal.trade_type}` : ''}
        </p>

        <div style={styles.divider} />

        <div style={styles.statRow}>
          <span style={styles.statLabel}>Estimated monthly fuel spend today</span>
          <span style={styles.statValue}>${fmt(proposal.avg_monthly_fuel_spend)}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Estimated monthly fuel savings (15%, conservative)</span>
          <span style={{ ...styles.statValue, color: '#1D9E75' }}>${fmt(proposal.estimated_monthly_fuel_savings)}</span>
        </div>
        <div style={styles.statRow}>
          <span style={styles.statLabel}>Estimated annual fuel savings</span>
          <span style={{ ...styles.statValue, color: '#1D9E75', fontSize: 22 }}>${fmt(proposal.estimated_annual_fuel_savings)}</span>
        </div>

        <div style={styles.divider} />

        <div style={styles.statRow}>
          <span style={styles.statLabel}>Estimated Minerva cost for your fleet</span>
          <span style={styles.statValue}>${fmt(proposal.estimated_minerva_monthly_cost)}/mo</span>
        </div>

        <p style={styles.disclaimer}>
          This is a planning estimate based on published fleet-telematics
          route-optimization benchmarks (typically 10-25% fuel reduction;
          this uses a conservative 15%), not a guarantee — actual savings
          depend on your current routing, vehicle types, and driving
          patterns. Also included at no extra calculation shown here: live
          GPS tracking, automated customer SMS updates, and (on the
          Industrial tier) safety/compliance incident logging and
          technician credential tracking.
        </p>

        <Link to="/start" style={styles.ctaBtn}>Start a free 7-day trial</Link>
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  card: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 20, padding: 36, maxWidth: 480, width: '100%' },
  bizName: { color: '#555', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 8px' },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold', margin: '0 0 6px', lineHeight: 1.3 },
  subtitle: { color: '#8899a6', fontSize: 14, margin: '0 0 10px' },
  divider: { height: 1, background: '#1e293b', margin: '18px 0' },
  statRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 },
  statLabel: { color: '#888', fontSize: 13, maxWidth: 260 },
  statValue: { color: '#fff', fontSize: 17, fontWeight: 'bold', whiteSpace: 'nowrap' },
  disclaimer: { color: '#555', fontSize: 11, lineHeight: 1.6, marginTop: 20 },
  ctaBtn: { display: 'block', textAlign: 'center', background: '#1D9E75', color: '#fff', textDecoration: 'none', borderRadius: 10, padding: '14px 0', fontSize: 15, fontWeight: 'bold', marginTop: 24 },
}
