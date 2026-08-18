import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Map, { Marker } from 'react-map-gl'
import { supabase } from '../supabaseClient'
import { timeAgo } from '../utils'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

export default function TrackingView() {
  const { jobId } = useParams()
  const [job, setJob] = useState(null)
  const [tech, setTech] = useState(null)
  const [business, setBusiness] = useState(null)
  const [error, setError] = useState(null)
  const [viewState, setViewState] = useState({
    latitude: -33.87, longitude: 151.21, zoom: 13
  })

  useEffect(() => { loadJob() }, [jobId])

  async function loadJob() {
    const { data: jobData, error: jobErr } = await supabase
      .from('jobs').select('*').eq('id', jobId).single()
    if (jobErr || !jobData) { setError('This tracking link has expired or is invalid.'); return }
    setJob(jobData)
    if (jobData.client_lat) {
      setViewState(prev => ({ ...prev, latitude: jobData.client_lat, longitude: jobData.client_lng }))
    }
    if (jobData.technician_id) {
      const { data: techData } = await supabase
        .from('technicians').select('*, businesses(*)').eq('id', jobData.technician_id).single()
      setTech(techData)
      setBusiness(techData?.businesses)
      if (techData?.current_lat) {
        setViewState(prev => ({ ...prev, latitude: techData.current_lat, longitude: techData.current_lng }))
      }
    }
  }

  // Real-time technician position updates
  useEffect(() => {
    if (!tech) return
    const channel = supabase
      .channel(`tracking-${jobId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'technicians',
        filter: `id=eq.${tech.id}`
      }, (payload) => {
        setTech(prev => ({ ...prev, ...payload.new }))
        if (payload.new.current_lat) {
          setViewState(prev => ({
            ...prev,
            latitude: payload.new.current_lat,
            longitude: payload.new.current_lng
          }))
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [tech?.id])

  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorCard}>
        <p style={{ color: '#8A2525', fontSize: 15, margin: 0 }}>{error}</p>
      </div>
    </div>
  )

  if (!job || !tech) return (
    <div style={styles.screen}>
      <p style={{ color: '#888', fontSize: 16 }}>Loading tracking...</p>
    </div>
  )

  if (job.status === 'complete') return (
    <div style={styles.screen}>
      <div style={styles.completeCard}>
        <p style={{ fontSize: 40, margin: '0 0 12px' }}>✅</p>
        <h2 style={{ color: '#1D9E75', margin: '0 0 8px' }}>Job Complete</h2>
        <p style={{ color: '#555', margin: 0 }}>{business?.name} has completed your service.</p>
      </div>
    </div>
  )

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#050811', fontFamily: 'Arial, sans-serif' }}>
      {/* Header bar */}
      <div style={styles.header}>
        <p style={styles.bizName}>{business?.name}</p>
        <p style={styles.heading}>Your technician is on the way</p>
        <div style={styles.liveBadge}>
          <span style={styles.liveDot} /> LIVE TRACKING
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1 }}>
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          {...viewState}
          onMove={e => setViewState(e.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/streets-v12"
        >
          {/* Technician dot */}
          {tech.current_lat && (
            <Marker latitude={tech.current_lat} longitude={tech.current_lng} anchor="center">
              <div style={styles.techDot}>
                <span style={{ fontSize: 11, fontWeight: 'bold' }}>{tech.name?.charAt(0)}</span>
              </div>
            </Marker>
          )}
          {/* Destination pin */}
          {job.client_lat && (
            <Marker latitude={job.client_lat} longitude={job.client_lng} anchor="bottom">
              <div style={{ fontSize: 28 }}>📍</div>
            </Marker>
          )}
        </Map>
      </div>

      {/* Footer info */}
      <div style={styles.footer}>
        <div>
          <p style={styles.techName}>{tech.name}</p>
          <p style={styles.techMeta}>Updated {timeAgo(tech.last_seen)}</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={styles.statusBadge}>En route</p>
        </div>
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif' },
  errorCard: { background: '#FAEAEA', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  completeCard: { background: '#fff', borderRadius: 16, padding: 32, maxWidth: 300, textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' },
  header: { background: '#0a0f1d', padding: '16px 20px', borderBottom: '1px solid #1e293b' },
  bizName: { color: '#555', fontSize: 12, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  heading: { color: '#fff', fontSize: 18, fontWeight: 'bold', margin: '0 0 8px' },
  liveBadge: { display: 'inline-flex', alignItems: 'center', background: '#1D9E7522', border: '1px solid #1D9E75', borderRadius: 20, padding: '3px 10px', color: '#1D9E75', fontSize: 11, fontWeight: 'bold', letterSpacing: 2 },
  liveDot: { width: 7, height: 7, borderRadius: '50%', background: '#1D9E75', marginRight: 6 },
  techDot: { width: 40, height: 40, borderRadius: '50%', background: '#2D5FA8', border: '3px solid #fff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.4)', fontSize: 14 },
  footer: { background: '#0a0f1d', padding: '16px 20px', borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  techName: { color: '#fff', fontSize: 16, fontWeight: 'bold', margin: '0 0 4px' },
  techMeta: { color: '#666', fontSize: 12, margin: 0 },
  statusBadge: { background: '#1D9E7522', color: '#1D9E75', border: '1px solid #1D9E75', borderRadius: 20, padding: '4px 12px', fontSize: 12, fontWeight: 'bold', margin: 0 }
}
