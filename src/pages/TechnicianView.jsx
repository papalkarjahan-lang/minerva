import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { haversineKm } from '../utils'

// GPS update interval in milliseconds
const GPS_INTERVAL_MS = 15000 // 15 seconds
// SMS trigger distance in kilometres
const SMS_TRIGGER_KM = 2.0
// localStorage key for GPS points that failed to reach Supabase (offline/
// network error) so they survive a page reload until they can be flushed.
const GPS_QUEUE_KEY = 'minerva_gps_queue'
// Feature-detect the Web Speech API once. Most non-Chrome-based mobile
// browsers don't implement it — the voice note button is hidden entirely
// when unsupported rather than throwing at click time.
const SpeechRecognitionAPI =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

// ── OFFLINE GPS QUEUE HELPERS ──────────────────────────────────
// Small localStorage-backed helpers so a queued GPS backlog survives a
// page reload (e.g. technician's phone screen locks/reloads while offline).
function loadQueuedPoints() {
  try {
    const raw = localStorage.getItem(GPS_QUEUE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch (_) {
    return []
  }
}

function saveQueuedPoints(points) {
  try {
    localStorage.setItem(GPS_QUEUE_KEY, JSON.stringify(points))
  } catch (_) {
    // localStorage unavailable (private browsing etc) — the in-memory
    // queue still works for the current session, just won't survive reload.
  }
}

export default function TechnicianView() {
  const [searchParams] = useSearchParams()
  const pin = searchParams.get('pin')

  const [tech, setTech] = useState(null)
  const [currentJob, setCurrentJob] = useState(null)
  const [business, setBusiness] = useState(null)
  const [tracking, setTracking] = useState(false)
  const [status, setStatus] = useState('idle') // idle | tracking | job_active | job_done
  const [error, setError] = useState(null)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [listening, setListening] = useState(false)

  const intervalRef = useRef(null)
  // In-memory queue of GPS points that failed to reach Supabase. Mirrored to
  // localStorage so a backlog survives a page reload while offline.
  const queueRef = useRef(loadQueuedPoints())
  // Guards against calling sync-technician-billing on every 15-second GPS
  // tick — only needs to fire once per page load, since the sync function
  // recomputes the full count server-side anyway.
  const billingSyncedRef = useRef(false)

  // Reflect any backlog restored from localStorage in the UI on first render.
  useEffect(() => {
    if (queueRef.current.length > 0) setPendingCount(queueRef.current.length)
  }, [])

  // Track browser connectivity so the badge can show "Offline" vs
  // "Reconnecting..." and so we can flush the queue the moment the browser
  // regains a connection, instead of waiting up to GPS_INTERVAL_MS.
  useEffect(() => {
    function handleOnline() { setIsOnline(true); flushQueue() }
    function handleOffline() { setIsOnline(false) }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [tech])

  // Load technician by PIN on mount
  useEffect(() => {
    if (!pin) { setError('No PIN provided. Use the link from your setup SMS.'); return }
    loadTech()
  }, [pin])

  async function loadTech() {
    const { data, error } = await supabase
      .from('technicians')
      .select('*, businesses(*)')
      .eq('pin', pin)
      .eq('is_active', true)
      .single()
    if (error || !data) { setError('PIN not recognised. Contact your manager.'); return }
    setTech(data)
    setBusiness(data.businesses)
    if (data.current_job_id) loadJob(data.current_job_id)
  }

  async function loadJob(jobId) {
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    if (data) setCurrentJob(data)
  }

  // Listen for the dispatcher assigning a new job (or clearing one) without
  // requiring the technician to manually refresh the page.
  useEffect(() => {
    if (!tech) return
    const channel = supabase
      .channel(`tech-${tech.id}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'technicians',
        filter: `id=eq.${tech.id}`
      }, (payload) => {
        const newJobId = payload.new.current_job_id
        if (newJobId && newJobId !== currentJob?.id) {
          loadJob(newJobId)
        } else if (!newJobId) {
          setCurrentJob(null)
        }
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [tech?.id, currentJob?.id])

  // GPS tracking loop
  useEffect(() => {
    if (!tracking || !tech) return
    intervalRef.current = setInterval(pushLocation, GPS_INTERVAL_MS)
    pushLocation() // push immediately
    return () => clearInterval(intervalRef.current)
  }, [tracking, tech, currentJob])

  // Add a failed point to the offline queue (in-memory + localStorage) so
  // tracking degrades gracefully instead of silently dying when offline.
  function enqueuePoint(lat, lng, timestamp) {
    const next = [...queueRef.current, { lat, lng, timestamp }]
    queueRef.current = next
    saveQueuedPoints(next)
    setPendingCount(next.length)
  }

  function clearQueue() {
    queueRef.current = []
    saveQueuedPoints([])
    setPendingCount(0)
  }

  // Catch up the dispatcher map after connectivity returns. We only send
  // the single most recent queued point (not every historical point) so we
  // don't spam a live dispatcher map with a burst of stale positions.
  async function flushQueue() {
    if (!tech || queueRef.current.length === 0) return
    const latest = queueRef.current[queueRef.current.length - 1]
    try {
      const { error: updateError } = await supabase.from('technicians').update({
        current_lat: latest.lat,
        current_lng: latest.lng,
        last_seen: new Date(latest.timestamp).toISOString()
      }).eq('id', tech.id)
      if (updateError) throw updateError
      clearQueue()
      setLastUpdate(new Date(latest.timestamp))
    } catch (_) {
      // Still offline/failed — leave the queue in place, next tick or the
      // next 'online' event will retry.
    }
  }

  async function pushLocation() {
    if (!navigator.geolocation) { setError('GPS not available on this device.'); return }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords
        const timestamp = Date.now()

        try {
          // Update position in Supabase
          const { error: updateError } = await supabase.from('technicians').update({
            current_lat: lat,
            current_lng: lng,
            last_seen: new Date(timestamp).toISOString()
          }).eq('id', tech.id)
          if (updateError) throw updateError
          setLastUpdate(new Date(timestamp))

          // First successful GPS push this session = this technician's phone
          // is confirmed "connected". Sync the business's Stripe subscription
          // quantity to the live count of connected technicians. Fire-and-
          // forget: billing sync should never block or break GPS tracking.
          if (!billingSyncedRef.current) {
            billingSyncedRef.current = true
            supabase.functions.invoke('sync-technician-billing', {
              body: { businessId: tech.business_id }
            }).catch(() => {})
          }

          // This point made it through, which is more recent than anything
          // still queued from earlier failures — safe to drop the backlog.
          if (queueRef.current.length > 0) clearQueue()

          // Check SMS trigger
          if (currentJob && !currentJob.sms_sent &&
              currentJob.client_lat && currentJob.client_lng) {
            const dist = haversineKm(lat, lng, currentJob.client_lat, currentJob.client_lng)
            if (dist < SMS_TRIGGER_KM) {
              await triggerSMS(lat, lng)
            }
          }
        } catch (_) {
          // Network error / offline — queue this point instead of losing it
          // silently. The next successful tick (or the 'online' event) will
          // catch the dispatcher map up with the latest known position.
          enqueuePoint(lat, lng, timestamp)
        }
      },
      (err) => setError(`GPS error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 10000 }
    )
  }

  async function triggerSMS(techLat, techLng) {
    const trackingUrl = `${import.meta.env.VITE_APP_URL}/track/${currentJob.id}`
    await supabase.functions.invoke('send-eta-sms', {
      body: {
        clientPhone: currentJob.client_phone,
        clientName: currentJob.client_name,
        techName: tech.name,
        businessName: business.name,
        trackingUrl
      }
    })
    // Mark SMS sent to prevent duplicate fires
    await supabase.from('jobs').update({ sms_sent: true }).eq('id', currentJob.id)
    setCurrentJob(prev => ({ ...prev, sms_sent: true }))
  }

  async function triggerCompletionSMS() {
    // Guard against double-firing (e.g. a double-tap on "Complete Job").
    if (!currentJob || currentJob.completion_sms_sent || !currentJob.client_phone) return
    await supabase.functions.invoke('send-completion-sms', {
      body: {
        clientPhone: currentJob.client_phone,
        clientName: currentJob.client_name,
        techName: tech.name,
        businessName: business.name,
        completedAt: new Date().toISOString()
      }
    })
    // Mark completion SMS sent to prevent duplicate fires, same pattern as sms_sent.
    await supabase.from('jobs').update({ completion_sms_sent: true }).eq('id', currentJob.id)
    setCurrentJob(prev => ({ ...prev, completion_sms_sent: true }))
  }

  // Feature-detected voice note recorder. Uses the browser's built-in
  // Web Speech API for on-device speech-to-text — no external transcription
  // service, so this stays free and requires no new dependency.
  function handleVoiceNote() {
    if (!SpeechRecognitionAPI || !currentJob || listening) return
    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'en-AU'
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setListening(true)
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript
      if (transcript) saveVoiceNote(transcript)
    }

    try {
      recognition.start()
    } catch (_) {
      setListening(false)
    }
  }

  async function saveVoiceNote(transcript) {
    if (!currentJob) return
    const entry = `[${new Date().toLocaleString('en-AU')}] ${transcript}`
    // Prepend a timestamp and concatenate — never overwrite prior notes.
    const updatedNotes = currentJob.notes ? `${currentJob.notes}\n${entry}` : entry
    await supabase.from('jobs').update({ notes: updatedNotes }).eq('id', currentJob.id)
    setCurrentJob(prev => ({ ...prev, notes: updatedNotes }))
  }

  async function handleStartJob() {
    if (!currentJob) return
    await supabase.from('jobs').update({
      status: 'active',
      started_at: new Date().toISOString()
    }).eq('id', currentJob.id)
    setCurrentJob(prev => ({ ...prev, status: 'active', started_at: new Date().toISOString() }))
    setTracking(true)
    setStatus('job_active')
  }

  async function handleCompleteJob() {
    clearInterval(intervalRef.current)
    setTracking(false)
    await supabase.from('jobs').update({
      status: 'complete',
      completed_at: new Date().toISOString()
    }).eq('id', currentJob.id)
    await supabase.from('technicians').update({
      current_job_id: null
    }).eq('id', tech.id)
    await triggerCompletionSMS()
    setStatus('job_done')
  }

  function handleStartTracking() {
    setTracking(true)
    setStatus('tracking')
  }

  // ── RENDER ──────────────────────────────────────────────────
  if (error) return (
    <div style={styles.screen}>
      <div style={styles.errorBox}>
        <p style={{ margin: 0, color: '#8A2525', fontSize: 16 }}>{error}</p>
      </div>
    </div>
  )

  if (!tech) return (
    <div style={styles.screen}>
      <p style={{ color: '#888', fontSize: 16 }}>Loading...</p>
    </div>
  )

  return (
    <div style={styles.screen}>
      {/* Header */}
      <div style={styles.header}>
        <p style={styles.bizName}>{business?.name}</p>
        <h1 style={styles.techName}>{tech.name}</h1>
        {tracking && (
          <div style={styles.liveBadge}>
            <span style={styles.liveDot} />
            LIVE
            {lastUpdate && <span style={{ fontSize: 11, marginLeft: 6, opacity: 0.8 }}>
              {lastUpdate.toLocaleTimeString()}
            </span>}
          </div>
        )}
        {tracking && pendingCount > 0 && (
          <div style={styles.offlineBadge}>
            <span style={styles.offlineDot} />
            {isOnline ? `Reconnecting... (${pendingCount} pending)` : `Offline - ${pendingCount} pending`}
          </div>
        )}
      </div>

      {/* Current job card */}
      {currentJob && (
        <div style={styles.jobCard}>
          <p style={styles.jobLabel}>CURRENT JOB</p>
          <p style={styles.clientName}>{currentJob.client_name}</p>
          <p style={styles.clientAddr}>{currentJob.client_address}</p>
          {currentJob.sms_sent && (
            <p style={styles.smsSent}>✓ Client notified (ETA SMS sent)</p>
          )}
          {currentJob.completion_sms_sent && (
            <p style={styles.smsSent}>✓ Client notified (job complete SMS sent)</p>
          )}
          <p style={styles.jobStatus}>Status: <strong>{currentJob.status}</strong></p>

          {SpeechRecognitionAPI && (
            <div style={{ marginTop: 14 }}>
              <button
                type="button"
                style={styles.voiceBtn}
                onClick={handleVoiceNote}
                disabled={listening}
              >
                {listening ? 'Listening...' : '🎤 Add voice note'}
              </button>
              {currentJob.notes && (
                <p style={styles.notesText}>{currentJob.notes}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div style={styles.btnGroup}>
        {status === 'idle' && !tracking && (
          <button style={styles.btnGreen} onClick={handleStartTracking}>
            Start Tracking
          </button>
        )}
        {status === 'tracking' && currentJob && currentJob.status === 'scheduled' && (
          <button style={styles.btnBlue} onClick={handleStartJob}>
            Start Job
          </button>
        )}
        {status === 'job_active' && (
          <button style={styles.btnOrange} onClick={handleCompleteJob}>
            Complete Job
          </button>
        )}
        {status === 'job_done' && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 20, color: '#1D9E75' }}>✓ Job Complete</p>
            <button style={styles.btnGreen} onClick={() => {
              setCurrentJob(null)
              setStatus('tracking')
              setTracking(true)
            }}>Ready for Next Job</button>
          </div>
        )}
      </div>

      {/* GPS status */}
      <p style={styles.gpsNote}>
        {tracking ? `GPS updates every 15 seconds` : `Tap "Start Tracking" to go live`}
      </p>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Arial, sans-serif' },
  header: { textAlign: 'center', marginBottom: 32 },
  bizName: { color: '#888', fontSize: 13, margin: '0 0 4px', letterSpacing: 2, textTransform: 'uppercase' },
  techName: { color: '#fff', fontSize: 28, margin: '0 0 12px', fontWeight: 'bold' },
  liveBadge: { display: 'inline-flex', alignItems: 'center', background: '#1D9E7522', border: '1px solid #1D9E75', borderRadius: 20, padding: '4px 12px', color: '#1D9E75', fontSize: 12, fontWeight: 'bold', letterSpacing: 2 },
  liveDot: { width: 8, height: 8, borderRadius: '50%', background: '#1D9E75', marginRight: 6, animation: 'pulse 1.5s infinite' },
  offlineBadge: { display: 'inline-flex', alignItems: 'center', background: '#A87C1622', border: '1px solid #A87C16', borderRadius: 20, padding: '4px 12px', color: '#A87C16', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginTop: 8 },
  offlineDot: { width: 8, height: 8, borderRadius: '50%', background: '#A87C16', marginRight: 6 },
  jobCard: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, marginBottom: 28 },
  jobLabel: { color: '#555', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 6px' },
  clientName: { color: '#fff', fontSize: 20, fontWeight: 'bold', margin: '0 0 4px' },
  clientAddr: { color: '#aaa', fontSize: 15, margin: '0 0 12px' },
  smsSent: { color: '#1D9E75', fontSize: 13, margin: '0 0 8px' },
  jobStatus: { color: '#888', fontSize: 13, margin: 0 },
  voiceBtn: { background: '#1e293b', color: '#fff', border: '1px solid #2D5FA8', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', width: '100%' },
  notesText: { color: '#888', fontSize: 12, whiteSpace: 'pre-wrap', margin: '10px 0 0', borderTop: '1px solid #1e293b', paddingTop: 10 },
  btnGroup: { display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 },
  btnGreen: { background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 14, padding: '18px 0', fontSize: 17, fontWeight: 'bold', cursor: 'pointer', width: '100%' },
  btnBlue: { background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 14, padding: '18px 0', fontSize: 17, fontWeight: 'bold', cursor: 'pointer', width: '100%' },
  btnOrange: { background: '#A87C16', color: '#fff', border: 'none', borderRadius: 14, padding: '18px 0', fontSize: 17, fontWeight: 'bold', cursor: 'pointer', width: '100%' },
  gpsNote: { color: '#444', fontSize: 12, marginTop: 24, textAlign: 'center' },
  errorBox: { background: '#FAEAEA', border: '1px solid #8A2525', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' }
}
