import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import Map, { Marker, Popup } from 'react-map-gl'
import { supabase } from '../supabaseClient'
import { timeAgo, geocodeAddress } from '../utils'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

export default function DispatcherView() {
  const { businessId } = useParams()
  const [business, setBusiness] = useState(null)
  const [technicians, setTechnicians] = useState([])
  const [jobs, setJobs] = useState([])
  const [selected, setSelected] = useState(null) // selected technician
  const [showAddJob, setShowAddJob] = useState(false)
  const [viewState, setViewState] = useState({
    latitude: -33.87,
    longitude: 151.21,
    zoom: 11
  })

  // Load business and initial data
  useEffect(() => {
    loadAll()
  }, [businessId])

  async function loadAll() {
    const { data: biz } = await supabase
      .from('businesses')
      .select('*')
      .eq('id', businessId)
      .single()
    setBusiness(biz)
    if (biz?.city) await setMapCenter(biz.city)

    const { data: techs } = await supabase
      .from('technicians')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
    setTechnicians(techs || [])

    const { data: jobList } = await supabase
      .from('jobs')
      .select('*')
      .eq('business_id', businessId)
      .in('status', ['scheduled', 'active'])
      .order('scheduled_time', { ascending: true })
    setJobs(jobList || [])
  }

  async function setMapCenter(city) {
    try {
      const { lat, lng } = await geocodeAddress(city + ', Australia')
      setViewState(prev => ({ ...prev, latitude: lat, longitude: lng }))
    } catch (_) {}
  }

  // Real-time subscription for technician positions
  useEffect(() => {
    const channel = supabase
      .channel('dispatcher-live')
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'technicians',
        filter: `business_id=eq.${businessId}`
      }, (payload) => {
        setTechnicians(prev =>
          prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } : t)
        )
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'jobs',
        filter: `business_id=eq.${businessId}`
      }, (payload) => {
        setJobs(prev =>
          prev.map(j => j.id === payload.new.id ? { ...j, ...payload.new } : j)
        )
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [businessId])

  // Assign job to technician
  async function assignJob(jobId, techId) {
    await supabase.from('jobs').update({ technician_id: techId }).eq('id', jobId)
    await supabase.from('technicians').update({ current_job_id: jobId }).eq('id', techId)
    await loadAll()
  }

  const techColors = ['#2D5FA8','#1D9E75','#A87C16','#8A2525','#534AB7','#185FA5']

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#050811', fontFamily: 'Arial, sans-serif' }}>

      {/* Left sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <p style={styles.bizLabel}>{business?.name || 'Loading...'}</p>
          <h2 style={styles.sidebarTitle}>Dispatch</h2>
        </div>

        {/* Technician list */}
        <div style={styles.section}>
          <p style={styles.sectionLabel}>TECHNICIANS ({technicians.length})</p>
          {technicians.map((tech, i) => {
            const job = jobs.find(j => j.id === tech.current_job_id)
            return (
              <div key={tech.id}
                style={{ ...styles.techRow, borderLeft: `3px solid ${techColors[i % techColors.length]}` }}
                onClick={() => {
                  setSelected(tech)
                  if (tech.current_lat) {
                    setViewState(prev => ({ ...prev, latitude: tech.current_lat, longitude: tech.current_lng, zoom: 14 }))
                  }
                }}>
                <p style={styles.techName}>{tech.name}</p>
                <p style={styles.techMeta}>
                  {job ? `On job: ${job.client_name}` : 'Available'}
                </p>
                <p style={styles.techMeta}>Last seen: {timeAgo(tech.last_seen)}</p>
              </div>
            )
          })}
        </div>

        {/* Job queue */}
        <div style={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={styles.sectionLabel}>JOB QUEUE ({jobs.length})</p>
            <button style={styles.addJobBtn} onClick={() => setShowAddJob(true)}>+ Add</button>
          </div>
          {jobs.map(job => (
            <div key={job.id} style={styles.jobRow}>
              <p style={styles.jobClient}>{job.client_name}</p>
              <p style={styles.jobAddr}>{job.client_address}</p>
              <p style={styles.jobStatus(job.status)}>{job.status.toUpperCase()}</p>
              {job.status === 'scheduled' && !job.technician_id && (
                <select style={styles.assignSelect}
                  onChange={(e) => e.target.value && assignJob(job.id, e.target.value)}>
                  <option value="">Assign tech...</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>
          ))}
          {jobs.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No active jobs</p>}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          mapboxAccessToken={MAPBOX_TOKEN}
          {...viewState}
          onMove={e => setViewState(e.viewState)}
          style={{ width: '100%', height: '100%' }}
          mapStyle="mapbox://styles/mapbox/dark-v11"
        >
          {/* Technician markers */}
          {technicians.map((tech, i) => tech.current_lat && (
            <Marker
              key={tech.id}
              latitude={tech.current_lat}
              longitude={tech.current_lng}
              anchor="center"
              onClick={(e) => { e.originalEvent.stopPropagation(); setSelected(tech) }}
            >
              <div style={{
                ...styles.marker,
                background: techColors[i % techColors.length]
              }}>
                {tech.name.charAt(0).toUpperCase()}
              </div>
            </Marker>
          ))}

          {/* Job markers */}
          {jobs.filter(j => j.client_lat).map(job => (
            <Marker key={job.id} latitude={job.client_lat} longitude={job.client_lng} anchor="bottom">
              <div style={styles.jobMarker}>📍</div>
            </Marker>
          ))}

          {/* Selected tech popup */}
          {selected && selected.current_lat && (
            <Popup
              latitude={selected.current_lat}
              longitude={selected.current_lng}
              anchor="bottom"
              onClose={() => setSelected(null)}
              closeOnClick={false}
            >
              <div style={{ padding: 8, minWidth: 180 }}>
                <p style={{ fontWeight: 'bold', margin: '0 0 4px', fontSize: 15 }}>{selected.name}</p>
                {jobs.find(j => j.id === selected.current_job_id) && (
                  <>
                    <p style={{ margin: '0 0 2px', fontSize: 13, color: '#555' }}>
                      {jobs.find(j => j.id === selected.current_job_id).client_name}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: '#888' }}>
                      {jobs.find(j => j.id === selected.current_job_id).client_address}
                    </p>
                  </>
                )}
                <p style={{ margin: '6px 0 0', fontSize: 12, color: '#1D9E75' }}>
                  Updated {timeAgo(selected.last_seen)}
                </p>
              </div>
            </Popup>
          )}
        </Map>
      </div>

      {/* Add Job Modal */}
      {showAddJob && (
        <AddJobModal
          businessId={businessId}
          onClose={() => { setShowAddJob(false); loadAll() }}
        />
      )}
    </div>
  )
}

// ── ADD JOB MODAL ──────────────────────────────────────────
function AddJobModal({ businessId, onClose }) {
  const [form, setForm] = useState({
    client_name: '', client_phone: '', client_address: '', scheduled_time: '', notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const { lat, lng } = await geocodeAddress(form.client_address)
      await supabase.from('jobs').insert({
        business_id: businessId,
        client_name: form.client_name,
        client_phone: form.client_phone,
        client_address: form.client_address,
        client_lat: lat,
        client_lng: lng,
        scheduled_time: form.scheduled_time || null,
        notes: form.notes || null,
        status: 'scheduled'
      })
      onClose()
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ margin: '0 0 20px', color: '#1B2B4B', fontSize: 20 }}>Add New Job</h3>
        <form onSubmit={handleSubmit}>
          {[
            ['Client name', 'client_name', 'text', true],
            ['Client phone', 'client_phone', 'tel', true],
            ['Client address', 'client_address', 'text', true],
            ['Scheduled time (optional)', 'scheduled_time', 'datetime-local', false],
            ['Notes (optional)', 'notes', 'text', false],
          ].map(([label, field, type, required]) => (
            <div key={field} style={{ marginBottom: 14 }}>
              <label style={styles.inputLabel}>{label}</label>
              <input
                type={type} required={required} value={form[field]} onChange={f(field)}
                style={styles.input}
              />
            </div>
          ))}
          {error && <p style={{ color: '#8A2525', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? 'Geocoding address...' : 'Add Job'}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

const styles = {
  sidebar: { width: 280, background: '#0a0f1d', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sidebarHeader: { padding: '20px 16px 12px', borderBottom: '1px solid #1e293b' },
  bizLabel: { color: '#555', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  sidebarTitle: { color: '#fff', fontSize: 22, margin: 0, fontWeight: 'bold' },
  section: { padding: '12px 16px', borderBottom: '1px solid #1e293b', overflowY: 'auto', maxHeight: '50vh' },
  sectionLabel: { color: '#555', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 10px' },
  techRow: { padding: '10px 10px 10px 12px', background: '#050811', borderRadius: 10, marginBottom: 8, cursor: 'pointer' },
  techName: { color: '#fff', fontSize: 14, fontWeight: 'bold', margin: '0 0 3px' },
  techMeta: { color: '#666', fontSize: 12, margin: '0 0 2px' },
  jobRow: { padding: '10px 12px', background: '#050811', borderRadius: 10, marginBottom: 8 },
  jobClient: { color: '#fff', fontSize: 14, fontWeight: 'bold', margin: '0 0 3px' },
  jobAddr: { color: '#666', fontSize: 12, margin: '0 0 4px' },
  jobStatus: (s) => ({ fontSize: 11, fontWeight: 'bold', margin: '0 0 6px', color: s === 'active' ? '#1D9E75' : '#A87C16' }),
  assignSelect: { width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #1e293b', background: '#0a0f1d', color: '#aaa', fontSize: 13, cursor: 'pointer' },
  addJobBtn: { background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  marker: { width: 36, height: 36, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14, border: '2px solid #fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' },
  jobMarker: { fontSize: 20, cursor: 'pointer' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 16, padding: 28, width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' },
  inputLabel: { display: 'block', fontSize: 13, fontWeight: 'bold', color: '#444', marginBottom: 5 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  submitBtn: { flex: 1, background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, fontWeight: 'bold', cursor: 'pointer' },
  cancelBtn: { flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, cursor: 'pointer' }
}
