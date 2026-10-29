import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import LoadingScreen from '../components/LoadingScreen'

// Public, unauthenticated trust/profile page for one business — built
// entirely from real operational data already in Minerva, not anything a
// business owner has to write themselves. Meant to be linked from a
// business's own website or Google Business listing, same spirit as the
// client portal (ClientHistoryView.jsx) but facing prospective clients
// instead of existing ones.
//
// HONESTY BOUNDARY, deliberate: this shows only facts Minerva actually
// knows are true — jobs completed, team size, service area/sector. It
// does NOT show "years in business" (Minerva only knows when a business
// joined Minerva, not when the real-world business was founded — showing
// one and implying the other would be misleading) and does NOT show star
// ratings or testimonials (no review data is stored here; the
// review_loop add-on sends a client to Google's own review page, it
// never captures a rating back into this app). Only real, known facts.
//
// businessId is not a secret — it's already embedded in every one of a
// business's own public tracking/invoice/quote links (see
// SECURITY_NOTES.md's established model) — so this route needs no token,
// just the `id, name, trade_type, city, sector` anon-readable column set
// (supabase_schema_delta_businesses_select_scoping.sql) plus anon-
// readable aggregate counts on jobs/technicians (both still "anon select"
// in the live schema, verified directly against the database before
// building this).
export default function BusinessCardView() {
  const { businessId } = useParams()
  const [business, setBusiness] = useState(null)
  const [jobsCompleted, setJobsCompleted] = useState(null)
  const [teamSize, setTeamSize] = useState(null)
  const [error, setError] = useState(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => { load() }, [businessId])

  async function load() {
    const { data: biz, error: bizErr } = await supabase
      .from('businesses')
      .select('id, name, trade_type, city, sector')
      .eq('id', businessId)
      .maybeSingle()
    if (bizErr || !biz) { setError("This page doesn't exist or isn't available."); return }
    setBusiness(biz)

    const { count: completedCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'complete')
    setJobsCompleted(completedCount ?? 0)

    const { count: techCount } = await supabase
      .from('technicians')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('is_active', true)
    setTeamSize(techCount ?? 0)

    setLoaded(true)
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!loaded) return <LoadingScreen label="Loading..." />

  const sectorLabel = business.sector === 'industrial' ? 'Industrial & site operations' : (business.trade_type || 'Trade services')

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        <p style={styles.eyebrow}>{sectorLabel}{business.city ? ` · ${business.city}` : ''}</p>
        <h1 style={styles.title}>{business.name}</h1>

        <div style={styles.statRow}>
          <div style={styles.stat}>
            <p style={styles.statNumber}>{jobsCompleted}</p>
            <p style={styles.statLabel}>Job{jobsCompleted === 1 ? '' : 's'} completed</p>
          </div>
          <div style={styles.stat}>
            <p style={styles.statNumber}>{teamSize}</p>
            <p style={styles.statLabel}>{teamSize === 1 ? 'Technician' : 'Technicians'} on the team</p>
          </div>
        </div>

        <p style={styles.footerNote}>
          Real operational data — tracked and dispatched with Minerva.
        </p>
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', padding: 24 },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  card: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 20, padding: 36, maxWidth: 420, width: '100%', textAlign: 'center' },
  eyebrow: { color: '#888', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 8px' },
  title: { color: '#fff', fontSize: 26, fontWeight: 'bold', margin: '0 0 28px' },
  statRow: { display: 'flex', justifyContent: 'center', gap: 36, marginBottom: 28 },
  stat: { textAlign: 'center' },
  statNumber: { color: '#1D9E75', fontSize: 34, fontWeight: 'bold', margin: '0 0 4px' },
  statLabel: { color: '#888', fontSize: 13, margin: 0 },
  footerNote: { color: '#666', fontSize: 11, margin: 0, borderTop: '1px solid #1e293b', paddingTop: 16 },
}
