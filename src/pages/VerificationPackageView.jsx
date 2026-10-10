import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'

// Industrial sibling of DisputeView.jsx — same "read-only, no-login,
// shareable-link evidence page" pattern (package-client-verification's own
// header comment already cited DisputeView as its intended parallel when
// this feature was first built, 2026-09-01), just never actually built.
// Found 2026-10-10 alongside the technician site-tracking gap: Features.jsx/
// Enterprise.jsx market "Client verification packages... for client and
// compliance handoff", and client_verification_packages carries a
// signed_off_at column with a "pending sign-off"/"signed off" badge already
// rendered in IndustrialDispatcherView.jsx's Verification tab — but before
// this page existed, there was no way for a client to ever SEE a package at
// all, and nothing anywhere ever wrote signed_off_at, so that badge would
// have read "pending sign-off" forever, for every package, permanently.
//
// Deliberately read-only, same trust model as /dispute/:jobId and
// /invoice/:invoiceId — there's no login gate, anyone with this URL can
// view it. No client self-service "sign off" button: no other page in this
// app has a client digitally sign/approve anything (checked before building
// this — every "approve" in the codebase is an internal operator action),
// so adding one here would be inventing a new pattern, not completing an
// existing one. Marking a package signed off stays a dispatcher-side
// manual action (IndustrialDispatcherView.jsx's "Mark signed off" button,
// same spirit as today's outreach "Record a reply or a win" — the operator
// records a real-world event they witnessed, not a stronger digital-
// signature claim this product has no other precedent for).
//
// The package's own `evidence` column is a complete snapshot taken at
// generation time (checkins/telemetry/safety_incidents) — this page reads
// that directly rather than re-querying the live tables, so it keeps
// showing exactly what was true when it was assembled even if the
// underlying site's data changes later. That's also why it needs no new
// anon access to site_projects/site_checkins/etc: one narrow, id-scoped
// anon SELECT on client_verification_packages itself is the only RLS this
// page requires (plus businesses.name, already anon-readable since
// 2026-10-10's businesses_select_scoping delta).
export default function VerificationPackageView() {
  const { packageId } = useParams()
  const [pkg, setPkg] = useState(null)
  const [business, setBusiness] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => { loadAll() }, [packageId])

  async function loadAll() {
    const { data, error: err } = await supabase
      .from('client_verification_packages')
      .select('*, businesses(name)')
      .eq('id', packageId)
      .single()
    if (err || !data) { setError('This verification package link is invalid.'); return }
    setPkg(data)
    setBusiness(data.businesses)
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!pkg) return (
    <div style={{ ...styles.screen, flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#2D5FA8', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#888', fontSize: 16, margin: 0 }}>Loading verification package...</p>
    </div>
  )

  const evidence = pkg.evidence || {}
  const checkins = Array.isArray(evidence.checkins) ? evidence.checkins : []
  const telemetry = Array.isArray(evidence.telemetry) ? evidence.telemetry : []
  const safetyIncidents = Array.isArray(evidence.safety_incidents) ? evidence.safety_incidents : []

  return (
    <div style={styles.screen}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>
      <div style={styles.wrap}>
        <div style={styles.header}>
          <p style={styles.bizName}>{business?.name}</p>
          <h1 style={styles.title}>Verification Package</h1>
          <p style={styles.subtitle}>Evidence record for a site — not editable from this page.</p>
        </div>

        <div style={styles.card}>
          <p style={styles.cardTitle}>SUMMARY</p>
          <p style={styles.line}>{pkg.summary}</p>
          <span style={pkg.signed_off_at ? styles.badgeSigned : styles.badgePending}>
            {pkg.signed_off_at ? `Signed off ${new Date(pkg.signed_off_at).toLocaleString('en-AU')}` : 'Pending sign-off'}
          </span>
        </div>

        <div style={styles.card}>
          <p style={styles.cardTitle}>SITE CHECK-INS ({checkins.length})</p>
          {checkins.length === 0 ? (
            <p style={styles.lineMuted}>No check-ins recorded at time of packaging.</p>
          ) : checkins.map((c, i) => (
            <p key={i} style={styles.line}>
              {c.role === 'human_technician' ? '👤' : '⚙️'} {c.person_name || 'Unknown'} — {(c.checkin_type || 'unknown').replace('_', ' ')}
              {c.detail ? ` (${c.detail})` : ''}
              <span style={styles.lineMuted}> · {new Date(c.created_at).toLocaleString('en-AU')}</span>
            </p>
          ))}
        </div>

        {telemetry.length > 0 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>ASSET TELEMETRY EVENTS ({telemetry.length})</p>
            {telemetry.map((t, i) => (
              <p key={i} style={styles.line}>
                {(t.event_type || 'event').replace('_', ' ')}{t.detail ? ` — ${t.detail}` : ''}
                <span style={styles.lineMuted}> · {new Date(t.created_at).toLocaleString('en-AU')}</span>
              </p>
            ))}
          </div>
        )}

        <div style={styles.card}>
          <p style={styles.cardTitle}>SAFETY LOG ({safetyIncidents.length})</p>
          {safetyIncidents.length === 0 ? (
            <p style={styles.lineMuted}>No safety incidents recorded at time of packaging.</p>
          ) : safetyIncidents.map((s, i) => (
            <p key={i} style={styles.line}>
              {s.severity === 'critical' ? '🔴' : s.severity === 'warning' ? '🟠' : '⚪'} {s.description}
              <span style={styles.lineMuted}> · {s.acknowledged_at ? 'acknowledged' : 'open'} · {new Date(s.created_at).toLocaleString('en-AU')}</span>
            </p>
          ))}
        </div>

        <button className="no-print" style={styles.printButton} onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>

        <p style={styles.footerNote}>Generated from Minerva site records. Share this link directly with the party who needs it.</p>
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#f5f5f5', display: 'flex', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: '24px 16px' },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center', margin: 'auto' },
  wrap: { maxWidth: 520, width: '100%' },
  header: { marginBottom: 16 },
  bizName: { color: '#888', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  title: { color: '#1B2B4B', fontSize: 26, fontWeight: 'bold', margin: '0 0 4px' },
  subtitle: { color: '#888', fontSize: 13, margin: 0 },
  card: { background: '#fff', border: '1px solid #eee', borderRadius: 14, padding: 18, marginBottom: 14 },
  cardTitle: { color: '#555', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 10px', fontWeight: 'bold' },
  line: { color: '#222', fontSize: 14, margin: '2px 0' },
  lineMuted: { color: '#888', fontSize: 13, margin: '2px 0' },
  badgeSigned: { display: 'inline-block', marginTop: 8, background: '#1D9E7522', color: '#1D9E75', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 6 },
  badgePending: { display: 'inline-block', marginTop: 8, background: '#A87C1622', color: '#A87C16', fontSize: 11, fontWeight: 'bold', letterSpacing: 0.5, textTransform: 'uppercase', padding: '4px 10px', borderRadius: 6 },
  printButton: { width: '100%', marginTop: 20, padding: '11px 0', background: '#fff', color: '#2D5FA8', border: '1px solid #ddd', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: 'pointer' },
  footerNote: { color: '#aaa', fontSize: 11, textAlign: 'center', marginTop: 8 }
}
