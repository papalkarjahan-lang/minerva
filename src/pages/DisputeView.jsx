import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Map, { Marker, Source, Layer } from 'react-map-gl'
import { supabase } from '../supabaseClient'
import { isMapboxTokenConfigured, haversineKm } from '../utils'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

// BONUS: Dispute Pack. Read-only, dispatcher-facing evidence page for a
// single completed (or any) job — GPS route while on site, checklist
// photos, materials used, and the invoice, all in one shareable link a
// dispatcher can forward to a client, insurer, or a payment platform's
// dispute process to show the job actually happened. Purely additive:
// reuses existing tables only (technician_locations already has a job_id
// column kept exactly for this purpose — see supabase_schema.sql comment —
// plus checklist_photos, job_materials, invoices). No new table, column, or
// edge function.
//
// SECURITY NOTE: same trust model as /track/:jobId and /invoice/:invoiceId —
// there's no login gate, anyone with this URL can view it. Treat the link
// like a secret (don't post it somewhere public); it's meant to be shared
// deliberately, one-to-one, with whoever is party to the dispute.
export default function DisputeView() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [business, setBusiness] = useState(null)
  const [tech, setTech] = useState(null)
  const [locations, setLocations] = useState([])
  const [photos, setPhotos] = useState([])
  const [materials, setMaterials] = useState([])
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState(null)
  const [viewState, setViewState] = useState({
    latitude: -33.87, longitude: 151.21, zoom: 15, pitch: 0, bearing: 0
  })
  // Route replay: lets whoever views this pack watch the technician's
  // on-site GPS breadcrumbs play back in order, rather than only seeing a
  // static first/last-point line — makes "did they actually go where/when
  // they said" much faster to check for a dispute or insurer. Purely a
  // view over the same `locations` already loaded above; no new data.
  const [replayIndex, setReplayIndex] = useState(0)
  const [replaying, setReplaying] = useState(false)
  const replayTimerRef = useRef(null)
  // TrackingView already guards against a runtime Mapbox tile/style error
  // (as opposed to the token-not-configured case below, which this page
  // already handled) — this page was missing the same fallback, so a
  // transient map failure left whoever's viewing this evidence pack
  // staring at a silently blank map box. (Fixed 2026-10-02.)
  const [mapError, setMapError] = useState(false)
  function handleMapTileError(e) {
    console.error('DisputeView: map tile/style error', e?.error || e)
    setMapError(true)
  }

  useEffect(() => { loadAll() }, [jobId])

  useEffect(() => {
    if (!replaying) return
    replayTimerRef.current = setInterval(() => {
      setReplayIndex(i => {
        if (i >= locations.length - 1) {
          setReplaying(false)
          return i
        }
        return i + 1
      })
    }, 350)
    return () => clearInterval(replayTimerRef.current)
  }, [replaying, locations.length])

  function toggleReplay() {
    if (locations.length < 2) return
    if (!replaying && replayIndex >= locations.length - 1) setReplayIndex(0)
    setReplaying(prev => !prev)
  }

  async function loadAll() {
    const { data: jobData, error: jobErr } = await supabase
      .from('jobs').select('*, businesses(name)').eq('id', jobId).single()
    if (jobErr || !jobData) { setError('This dispute pack link is invalid.'); return }
    setJob(jobData)
    setBusiness(jobData.businesses)

    if (jobData.technician_id) {
      const { data: techData, error: techErr } = await supabase
        .from('technicians').select('id, name').eq('id', jobData.technician_id).single()
      if (techErr) console.error('DisputeView: technician fetch failed', techErr)
      setTech(techData)
    }

    // Note: each of these four queries fails independently below (logged,
    // not surfaced as a page-level error) rather than blocking the whole
    // pack on one missing table — a dispute pack with, say, no photos but
    // real GPS/invoice data is still useful to show.
    const { data: locs, error: locsErr } = await supabase
      .from('technician_locations')
      .select('lat, lng, recorded_at')
      .eq('job_id', jobId)
      .order('recorded_at', { ascending: true })
    if (locsErr) console.error('DisputeView: locations fetch failed', locsErr)
    setLocations(locs || [])
    setReplayIndex(0)
    setReplaying(false)
    if (locs && locs.length > 0) {
      setViewState(prev => ({ ...prev, latitude: locs[0].lat, longitude: locs[0].lng }))
    } else if (jobData.client_lat) {
      setViewState(prev => ({ ...prev, latitude: jobData.client_lat, longitude: jobData.client_lng }))
    }

    const { data: photoList, error: photosErr } = await supabase
      .from('checklist_photos').select('*').eq('job_id', jobId).order('created_at', { ascending: true })
    if (photosErr) console.error('DisputeView: photos fetch failed', photosErr)
    setPhotos(photoList || [])

    const { data: materialList, error: materialsErr } = await supabase
      .from('job_materials').select('*').eq('job_id', jobId).order('created_at', { ascending: true })
    if (materialsErr) console.error('DisputeView: materials fetch failed', materialsErr)
    setMaterials(materialList || [])

    const { data: invoiceData, error: invoiceErr } = await supabase
      .from('invoices').select('*').eq('job_id', jobId).order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (invoiceErr) console.error('DisputeView: invoice fetch failed', invoiceErr)
    setInvoice(invoiceData || null)
  }

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  // Static text here (unlike the shared, spinner-based LoadingScreen used
  // by TrackingView/InvoiceView/QuoteView/ClientHistoryView) previously
  // read as a frozen page on a slow connection — LoadingScreen itself is
  // hardcoded to those pages' dark theme, so this reuses the same global
  // `spin` keyframe (index.css) directly rather than making the shared
  // component theme-aware for one light-themed caller. (Fixed 2026-10-02.)
  if (!job) return (
    <div style={{ ...styles.screen, flexDirection: 'column', alignItems: 'center', gap: 14 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid #e2e8f0', borderTopColor: '#2D5FA8', animation: 'spin 0.8s linear infinite' }} />
      <p style={{ color: '#888', fontSize: 16, margin: 0 }}>Loading dispute pack...</p>
    </div>
  )

  const checklistResults = Array.isArray(job.checklist_results) ? job.checklist_results : []

  return (
    <div style={styles.screen}>
      {/* This page's own header comment says its purpose is being forwarded
          to "a client, insurer, or a payment platform's dispute process" —
          about as strong a case for a clean printed/PDF'd version as any
          page in this app has, yet it had none. Already light-themed
          (unlike InvoiceView/QuoteView) so no color overrides needed —
          just hide the interactive replay controls and the WebGL map
          canvas itself (canvas/WebGL print support is unreliable across
          browsers; the GPS summary paragraph right below the map is
          already always rendered regardless of map success, same
          fallback-to-text philosophy this page already uses when Mapbox
          isn't configured at all). */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
        }
      `}</style>
      <div style={styles.wrap}>
        <div style={styles.header}>
          <p style={styles.bizName}>{business?.name}</p>
          <h1 style={styles.title}>Dispute Pack</h1>
          <p style={styles.subtitle}>Evidence record for a single job — not editable from this page.</p>
        </div>

        {/* Job summary */}
        <div style={styles.card}>
          <p style={styles.cardTitle}>JOB</p>
          <p style={styles.line}><strong>{job.client_name || 'Client'}</strong></p>
          <p style={styles.lineMuted}>{job.client_address}</p>
          <p style={styles.lineMuted}>Status: {job.status}{tech?.name ? ` · Technician: ${tech.name}` : ''}</p>
          {job.scheduled_time && <p style={styles.lineMuted}>Scheduled: {new Date(job.scheduled_time).toLocaleString('en-AU')}</p>}
          {job.started_at && <p style={styles.lineMuted}>Started: {new Date(job.started_at).toLocaleString('en-AU')}</p>}
          {job.completed_at && <p style={styles.lineMuted}>Completed: {new Date(job.completed_at).toLocaleString('en-AU')}</p>}
        </div>

        {/* GPS route while on this job */}
        <div style={styles.card}>
          <p style={styles.cardTitle}>ON-SITE GPS ROUTE ({locations.length} points)</p>
          {locations.length === 0 ? (
            <p style={styles.lineMuted}>No GPS breadcrumbs recorded against this job.</p>
          ) : (
            <div style={{ height: 280, borderRadius: 10, overflow: 'hidden', marginTop: 10 }}>
              {!isMapboxTokenConfigured() || mapError ? (
                // Same underlying gap as DispatcherView/TrackingView (see
                // isMapboxTokenConfigured in utils.js) — this evidence page
                // is read-only and shares no state with either of those, so
                // it needs its own guard. The route's raw first/last-point
                // timestamps are still printed below regardless, so a
                // dispute pack viewed before Mapbox is connected (or hitting
                // a transient tile/style error, see mapError above) is still
                // useful evidence, just without the visual route.
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f5f5', color: '#888', fontSize: 13, textAlign: 'center', padding: 16 }}>
                  Map preview unavailable — GPS points are still listed below.
                </div>
              ) : (
              <div className="no-print" style={{ width: '100%', height: '100%' }}>
              <Map
                mapboxAccessToken={MAPBOX_TOKEN}
                {...viewState}
                onMove={e => setViewState(e.viewState)}
                onError={handleMapTileError}
                antialias
                style={{ width: '100%', height: '100%' }}
                mapStyle="mapbox://styles/mapbox/streets-v12"
              >
                {locations.length > 1 && (
                  <Source
                    id="dispute-route"
                    type="geojson"
                    data={{
                      type: 'Feature',
                      geometry: { type: 'LineString', coordinates: locations.map(p => [p.lng, p.lat]) }
                    }}
                  >
                    <Layer
                      id="dispute-route-line"
                      type="line"
                      paint={{ 'line-color': '#2D5FA8', 'line-width': 3, 'line-opacity': 0.9 }}
                      layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                    />
                  </Source>
                )}
                {job.client_lat && (
                  <Marker latitude={job.client_lat} longitude={job.client_lng} anchor="bottom">
                    <div style={{ fontSize: 24 }}>📍</div>
                  </Marker>
                )}
                <Marker latitude={locations[0].lat} longitude={locations[0].lng} anchor="center">
                  <div style={styles.routeDot('#1D9E75')} title="First recorded point" />
                </Marker>
                <Marker latitude={locations[locations.length - 1].lat} longitude={locations[locations.length - 1].lng} anchor="center">
                  <div style={styles.routeDot('#8A2525')} title="Last recorded point" />
                </Marker>
                {locations.length > 1 && (
                  <Marker latitude={locations[replayIndex].lat} longitude={locations[replayIndex].lng} anchor="center">
                    <div style={styles.replayDot} title={new Date(locations[replayIndex].recorded_at).toLocaleString('en-AU')} />
                  </Marker>
                )}
              </Map>
              </div>
              )}
              <p style={{ ...styles.lineMuted, marginTop: 8 }}>
                First point {new Date(locations[0].recorded_at).toLocaleString('en-AU')}
                {job.client_lat != null && ` (${haversineKm(locations[0].lat, locations[0].lng, job.client_lat, job.client_lng).toFixed(2)} km from client address)`}
                {' · '}
                Last point {new Date(locations[locations.length - 1].recorded_at).toLocaleString('en-AU')}
                {job.client_lat != null && ` (${haversineKm(locations[locations.length - 1].lat, locations[locations.length - 1].lng, job.client_lat, job.client_lng).toFixed(2)} km from client address)`}
              </p>
              {locations.length > 1 && isMapboxTokenConfigured() && !mapError && (
                <div className="no-print" style={styles.replayBar}>
                  <button type="button" style={styles.replayBtn} onClick={toggleReplay}>
                    {replaying ? '⏸ Pause' : '▶ Replay route'}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={locations.length - 1}
                    value={replayIndex}
                    onChange={e => { setReplaying(false); setReplayIndex(Number(e.target.value)) }}
                    style={styles.replaySlider}
                  />
                  <span style={styles.replayTime}>{new Date(locations[replayIndex].recorded_at).toLocaleTimeString('en-AU')}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Completion checklist */}
        {checklistResults.length > 0 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>COMPLETION CHECKLIST</p>
            {checklistResults.map((r, i) => (
              <p key={i} style={styles.line}>{r.checked ? '✅' : '⬜'} {r.item}</p>
            ))}
          </div>
        )}

        {/* Checklist photos */}
        {photos.length > 0 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>PHOTO EVIDENCE ({photos.length})</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              {photos.map(photo => {
                const url = supabase.storage.from('checklist-photos').getPublicUrl(photo.storage_path).data.publicUrl
                return (
                  <a key={photo.id} href={url} target="_blank" rel="noreferrer" title={photo.checklist_item}>
                    <img src={url} alt={photo.checklist_item} style={styles.photoThumb} />
                  </a>
                )
              })}
            </div>
          </div>
        )}

        {/* Materials used */}
        {materials.length > 0 && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>MATERIALS USED</p>
            {materials.map(m => (
              <p key={m.id} style={styles.line}>{m.item_name} — {m.quantity_used}</p>
            ))}
          </div>
        )}

        {/* Invoice */}
        {invoice && (
          <div style={styles.card}>
            <p style={styles.cardTitle}>INVOICE</p>
            <p style={styles.line}>Total: <strong>${Number(invoice.total).toFixed(2)}</strong> · {invoice.status === 'paid' ? 'PAID' : 'UNPAID'}</p>
            <a href={`/invoice/${invoice.id}`} target="_blank" rel="noreferrer" style={styles.invoiceLink}>
              View full invoice →
            </a>
          </div>
        )}

        <button className="no-print" style={styles.printButton} onClick={() => window.print()}>
          🖨️ Print / Save as PDF
        </button>

        <p style={styles.footerNote}>Generated from Minerva job records. Share this link directly with the party who needs it.</p>
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
  photoThumb: { width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: '1px solid #eee' },
  routeDot: (color) => ({ width: 14, height: 14, borderRadius: '50%', background: color, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }),
  replayDot: { width: 18, height: 18, borderRadius: '50%', background: '#2D5FA8', border: '3px solid #fff', boxShadow: '0 0 0 4px rgba(45,95,168,0.35), 0 1px 4px rgba(0,0,0,0.4)' },
  replayBar: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 },
  replayBtn: { flexShrink: 0, background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' },
  replaySlider: { flex: 1 },
  replayTime: { flexShrink: 0, color: '#888', fontSize: 12, minWidth: 64, textAlign: 'right' },
  invoiceLink: { color: '#2D5FA8', fontSize: 13, fontWeight: 'bold', textDecoration: 'none' },
  printButton: { width: '100%', marginTop: 20, padding: '11px 0', background: '#fff', color: '#2D5FA8', border: '1px solid #ddd', borderRadius: 10, fontSize: 13, fontWeight: 'bold', cursor: 'pointer' },
  footerNote: { color: '#aaa', fontSize: 11, textAlign: 'center', marginTop: 8 }
}
