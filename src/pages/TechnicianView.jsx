import { useEffect, useState, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { haversineKm } from '../utils'
import { hasAddon } from '../maxAddons'

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
  // Pro-tier on-site invoicing: shown after "Complete Job" is tapped, before
  // the job is actually finalised, so the technician can optionally build
  // an invoice and text it to the client.
  const [showInvoiceBuilder, setShowInvoiceBuilder] = useState(false)
  const [invoiceItems, setInvoiceItems] = useState([{ description: '', amount: '' }])
  const [invoiceSubmitting, setInvoiceSubmitting] = useState(false)
  const [invoiceError, setInvoiceError] = useState(null)
  // Persists past the invoice builder closing (unlike invoiceError, which
  // only renders inside that card) — see submitInvoice()'s smsFailed path.
  const [invoiceSmsWarning, setInvoiceSmsWarning] = useState(null)
  // Pro-tier compliance checklist: shown before invoicing, once per job, if
  // the business has a template set up. Technician must tick every item
  // before they can continue.
  const [checklistTemplate, setChecklistTemplate] = useState(null)
  const [showChecklist, setShowChecklist] = useState(false)
  const [checklistChecks, setChecklistChecks] = useState([])
  const [checklistDone, setChecklistDone] = useState(false)
  // Optional photo evidence per checklist item — index-aligned with
  // checklistTemplate.items/checklistChecks. Never required, so a tech
  // without a good photo opportunity can still submit the checklist.
  const [checklistPhotos, setChecklistPhotos] = useState([])
  // Set if a checklist photo permanently fails to upload after retries —
  // persists past the checklist card closing (same pattern as
  // invoiceSmsWarning) so the technician still finds out, even though it
  // never blocks job completion.
  const [checklistPhotoWarning, setChecklistPhotoWarning] = useState(null)
  // Pro-tier materials-used: shown after the checklist (if any), lets the
  // technician optionally log parts/materials consumed on this job against
  // this business's inventory_items. Also optional — skips straight to
  // invoicing if the business tracks no inventory items.
  const [inventoryItems, setInventoryItems] = useState([])
  const [showMaterials, setShowMaterials] = useState(false)
  const [materialLines, setMaterialLines] = useState([{ inventory_item_id: '', quantity_used: '' }])
  const [materialsDone, setMaterialsDone] = useState(false)
  // Pro-tier onboarding checklist: shown once, before the technician's very
  // first "Start Tracking" tap, gated on technicians.onboarding_completed_at.
  const [onboardingTemplate, setOnboardingTemplate] = useState(null)
  const [showOnboardingChecklist, setShowOnboardingChecklist] = useState(false)
  const [onboardingChecks, setOnboardingChecks] = useState([])
  // Pro-tier Licence/Ticket Expiry Guardian: read-only heads-up for the
  // technician's own credentials expiring within 30 days (or already
  // expired). Purely informational — this view can't edit or dismiss
  // anything, it just mirrors what check-credential-expiry is watching so
  // the technician isn't caught out mid-job. Never blocks any action here.
  const [expiringCredentials, setExpiringCredentials] = useState([])
  // Round-2 batch (2026-09-04): multi-technician job splitting. A crew
  // member's technicians.current_job_id points at the same job as the lead
  // (jobs.technician_id) — that's what makes currentJob load for them at
  // all — but only the lead may drive status-changing actions below.
  const isCrew = !!(currentJob && tech && currentJob.technician_id && currentJob.technician_id !== tech.id)
  const [leavingJob, setLeavingJob] = useState(false)

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

  // Auto-flush any backlog the moment tech loads — covers the case where
  // the phone was offline/dead with queued points, then reopened already
  // online (no 'online' browser event fires in that case, since the
  // connection didn't transition while the page was loaded — it would
  // otherwise sit queued until the next GPS tick after tracking resumes).
  useEffect(() => {
    if (tech && isOnline && queueRef.current.length > 0) flushQueue()
  }, [tech])

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

    // Compliance checklists are a Pro-tier feature — one template per
    // business, applied to every job completion.
    if (data.businesses?.subscription_tier === 'pro') {
      const { data: template } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('business_id', data.business_id)
        .eq('type', 'completion')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setChecklistTemplate(template || null)

      const { data: onboardingTpl } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('business_id', data.business_id)
        .eq('type', 'onboarding')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setOnboardingTemplate(onboardingTpl || null)

      // Materials-used picker needs this business's inventory to select
      // from — same table/query shape DispatcherView uses for its
      // Inventory tab.
      const { data: inventoryList } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('business_id', data.business_id)
        .order('name', { ascending: true })
      setInventoryItems(inventoryList || [])

      // Read-only credentials-expiring-soon banner — see state comment above.
      const thirtyDaysOut = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { data: credList } = await supabase
        .from('technician_credentials')
        .select('credential_name, expiry_date')
        .eq('technician_id', data.id)
        .lte('expiry_date', thirtyDaysOut)
        .order('expiry_date', { ascending: true })
      setExpiringCredentials(credList || [])
    }
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
      // Breadcrumb history — same best-effort spirit as the live position
      // update above. Only the single most recent queued point (consistent
      // with the comment above: we don't backfill the whole offline gap).
      supabase.from('technician_locations').insert({
        technician_id: tech.id,
        business_id: tech.business_id,
        job_id: currentJob?.id || null,
        lat: latest.lat,
        lng: latest.lng,
        recorded_at: new Date(latest.timestamp).toISOString()
      }).then(({ error }) => { if (error) console.error('technician_locations insert failed', error) })
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

          // Breadcrumb history — fire-and-forget, same as billing sync below;
          // must never block or break live GPS tracking.
          supabase.from('technician_locations').insert({
            technician_id: tech.id,
            business_id: tech.business_id,
            job_id: currentJob?.id || null,
            lat, lng,
            recorded_at: new Date(timestamp).toISOString()
          }).then(({ error }) => { if (error) console.error('technician_locations insert failed', error) })

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

  // Crew members get a reduced, track-only view — see "Leave job" below.
  async function leaveJob() {
    if (!currentJob || !tech) return
    setLeavingJob(true)
    await supabase.from('job_assignments').delete().eq('job_id', currentJob.id).eq('technician_id', tech.id)
    await supabase.from('technicians').update({ current_job_id: null }).eq('id', tech.id)
    setCurrentJob(null)
    setLeavingJob(false)
  }

  async function handleStartJob() {
    if (!currentJob || isCrew) return
    await supabase.from('jobs').update({
      status: 'active',
      started_at: new Date().toISOString()
    }).eq('id', currentJob.id)
    setCurrentJob(prev => ({ ...prev, status: 'active', started_at: new Date().toISOString() }))
    setTracking(true)
    setStatus('job_active')
  }

  async function handleCompleteJob() {
    if (isCrew) return
    // Pro-tier businesses may require a compliance checklist before the job
    // can be finalised, then an optional materials-used log, then the option
    // to build an invoice. Everyone else (or once every step is done/
    // skipped) goes straight to finishTheJob().
    if (business?.subscription_tier === 'pro') {
      if (checklistTemplate && !checklistDone) {
        setChecklistChecks(new Array(checklistTemplate.items.length).fill(false))
        setChecklistPhotos(new Array(checklistTemplate.items.length).fill(null))
        setShowChecklist(true)
        return
      }
      if (inventoryItems.length > 0 && !materialsDone) {
        setShowMaterials(true)
        return
      }
      setShowInvoiceBuilder(true)
      return
    }
    await finishTheJob()
  }

  function toggleChecklistItem(index) {
    setChecklistChecks(prev => prev.map((checked, i) => i === index ? !checked : checked))
  }

  // Attach (or clear) an optional photo for one checklist item. Index-
  // aligned with checklistTemplate.items — never required to tick the item.
  function setChecklistPhoto(index, file) {
    setChecklistPhotos(prev => prev.map((f, i) => i === index ? file : f))
  }

  // Retries a checklist photo upload up to 3 times with backoff (1s/3s) —
  // job sites often have poor reception, and a single dropped request
  // shouldn't mean the evidence photo is silently lost. Returns true/false
  // for whether it eventually succeeded (upload + row insert both).
  async function uploadOneChecklistPhoto(item, file, path) {
    const delays = [0, 1000, 3000]
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (delays[attempt] > 0) await new Promise(r => setTimeout(r, delays[attempt]))
      const { error: uploadError } = await supabase.storage.from('checklist-photos').upload(path, file)
      if (uploadError) { console.error(`checklist photo upload failed (attempt ${attempt + 1})`, uploadError); continue }
      const { error: insertError } = await supabase.from('checklist_photos').insert({
        job_id: currentJob.id,
        business_id: tech.business_id,
        checklist_item: item,
        storage_path: path,
      })
      if (insertError) { console.error(`checklist_photos insert failed (attempt ${attempt + 1})`, insertError); continue }
      return true
    }
    return false
  }

  // Uploads any attached checklist photos to the 'checklist-photos' bucket,
  // retrying transient failures (see above). Fire-and-forget from the
  // caller's perspective, same as the technician_locations breadcrumb
  // insert and the billing sync call — a failed photo upload should never
  // block job completion — but unlike before, a photo that fails all 3
  // attempts now surfaces a warning instead of just a console.error, since
  // that photo is genuinely lost (no offline persistence for File objects
  // across a page reload — see checklistPhotoWarning).
  async function uploadChecklistPhotos() {
    let failedCount = 0
    await Promise.all(checklistTemplate.items.map(async (item, i) => {
      const file = checklistPhotos[i]
      if (!file) return
      const slug = item.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'item'
      const path = `${currentJob.id}/${slug}-${Date.now()}.jpg`
      const ok = await uploadOneChecklistPhoto(item, file, path)
      if (!ok) failedCount++
    }))
    if (failedCount > 0) {
      setChecklistPhotoWarning(`${failedCount} checklist photo${failedCount === 1 ? '' : 's'} failed to upload after retrying — worth retaking if you're back near this job.`)
    }
  }

  async function confirmChecklist() {
    const results = checklistTemplate.items.map((item, i) => ({ item, checked: checklistChecks[i] }))
    await supabase.from('jobs').update({ checklist_results: results }).eq('id', currentJob.id)
    setCurrentJob(prev => ({ ...prev, checklist_results: results }))
    uploadChecklistPhotos()
    setChecklistDone(true)
    setShowChecklist(false)
    if (inventoryItems.length > 0) {
      setShowMaterials(true)
    } else {
      setShowInvoiceBuilder(true)
    }
  }

  function addMaterialLine() {
    setMaterialLines(prev => [...prev, { inventory_item_id: '', quantity_used: '' }])
  }

  function removeMaterialLine(index) {
    setMaterialLines(prev => prev.filter((_, i) => i !== index))
  }

  function updateMaterialLine(index, field, value) {
    setMaterialLines(prev => prev.map((line, i) => i === index ? { ...line, [field]: value } : line))
  }

  function skipMaterials() {
    setMaterialsDone(true)
    setShowMaterials(false)
    setShowInvoiceBuilder(true)
  }

  // For each valid material line: insert a job_materials row, then decrement
  // the matching inventory_items.quantity. Both writes are fire-and-forget-
  // safe (never block job completion) — errors just get logged, same
  // pattern as the technician_locations insert above.
  async function confirmMaterials() {
    const validLines = materialLines
      .filter(l => l.inventory_item_id && Number(l.quantity_used) > 0)
      .map(l => {
        const item = inventoryItems.find(i => i.id === l.inventory_item_id)
        return {
          inventory_item_id: l.inventory_item_id,
          item_name: item?.name || 'Unknown item',
          quantity_used: Number(l.quantity_used),
          currentQty: item?.quantity ?? 0
        }
      })

    validLines.forEach(line => {
      supabase.from('job_materials').insert({
        job_id: currentJob.id,
        business_id: tech.business_id,
        inventory_item_id: line.inventory_item_id,
        item_name: line.item_name,
        quantity_used: line.quantity_used
      }).then(({ error }) => { if (error) console.error('job_materials insert failed', error) })

      supabase.from('inventory_items').update({
        quantity: Math.max(0, line.currentQty - line.quantity_used)
      }).eq('id', line.inventory_item_id)
        .then(({ error }) => { if (error) console.error('inventory_items decrement failed', error) })
    })

    setMaterialsDone(true)
    setShowMaterials(false)
    setShowInvoiceBuilder(true)
  }

  // The actual job-completion side effects, shared by both the "no invoice"
  // path and the "invoice sent" path.
  async function finishTheJob() {
    clearInterval(intervalRef.current)
    setTracking(false)
    await supabase.from('jobs').update({
      status: 'complete',
      completed_at: new Date().toISOString()
    }).eq('id', currentJob.id)
    await supabase.from('technicians').update({
      current_job_id: null
    }).eq('id', tech.id)
    // Release any crew members too — only the lead's finishTheJob() call
    // reaches here, so this is the one place that needs to clean up
    // job_assignments for everyone who was helping on this job.
    const { data: crew } = await supabase.from('job_assignments').select('technician_id').eq('job_id', currentJob.id)
    if (crew && crew.length > 0) {
      await supabase.from('technicians').update({ current_job_id: null }).in('id', crew.map(c => c.technician_id))
      await supabase.from('job_assignments').delete().eq('job_id', currentJob.id)
    }
    await triggerCompletionSMS()
    // Custom Workflows: fire the 'job.completed' trigger for this business, if any are configured.
    supabase.functions.invoke('run-custom-workflows', {
      body: { businessId: currentJob.business_id, event: 'job.completed', payload: { trade_type: currentJob.trade_type, client_address: currentJob.client_address } },
    }).catch(() => {})
    setStatus('job_done')
  }

  function addInvoiceItem() {
    setInvoiceItems(prev => [...prev, { description: '', amount: '' }])
  }

  // Emergency callout surge-pricing suggestion — a deterministic premium
  // based on time-of-day/day-of-week (not a real-time demand model), added
  // as a normal editable/removable invoice line item. The technician can
  // edit the amount or remove it entirely before sending — this only ever
  // pre-fills a suggestion, never changes what actually gets charged.
  function addEmergencyPremiumLine() {
    const now = new Date()
    const hour = now.getHours()
    const isWeekend = now.getDay() === 0 || now.getDay() === 6
    const isAfterHours = hour < 7 || hour >= 18
    let premium = 75 // base emergency-callout fee
    if (isAfterHours) premium += 50
    if (isWeekend) premium += 50
    setInvoiceItems(prev => {
      const withoutBlank = prev.filter(i => i.description.trim() || Number(i.amount) > 0)
      return [...withoutBlank, { description: 'Emergency callout premium', amount: String(premium) }]
    })
  }

  function removeInvoiceItem(index) {
    setInvoiceItems(prev => prev.filter((_, i) => i !== index))
  }

  function updateInvoiceItem(index, field, value) {
    setInvoiceItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  function skipInvoice() {
    setShowInvoiceBuilder(false)
    finishTheJob()
  }

  async function submitInvoice() {
    const validItems = invoiceItems
      .filter(item => item.description.trim() && Number(item.amount) > 0)
      .map(item => ({ description: item.description.trim(), amount: Number(item.amount) }))

    if (validItems.length === 0) {
      setInvoiceError('Add at least one line item with a description and amount, or skip the invoice.')
      return
    }
    setInvoiceError(null)

    setInvoiceSubmitting(true)
    const subtotal = validItems.reduce((sum, item) => sum + item.amount, 0)
    const gst = subtotal * 0.1
    const total = subtotal + gst

    try {
      const { data, error: insertError } = await supabase.from('invoices').insert({
        business_id: tech.business_id,
        job_id: currentJob.id,
        client_name: currentJob.client_name,
        client_phone: currentJob.client_phone,
        line_items: validItems,
        subtotal,
        gst,
        total,
        status: 'unpaid',
        // Snapshot at invoice-creation time — Watchtower runs on a 15-min
        // cron, so this is usually still false for a same-visit invoice.
        // If it verifies later, the badge won't retroactively appear here;
        // see verify-checklist-photos/index.ts header for why that's fine.
        ai_verified: !!currentJob.ai_verified_at
      }).select().single()
      if (insertError) throw insertError

      // SMS failure here must never block invoice creation or job
      // completion — the invoice already exists in the DB either way. But a
      // silently-failed send means the client never gets their payment
      // link, so track it (client_sms_failed) so the dispatcher can spot
      // and manually resend/follow up, rather than it being invisible.
      let smsFailed = false
      if (currentJob.client_phone) {
        const invoiceUrl = `${import.meta.env.VITE_APP_URL}/invoice/${data.id}`
        const { error: smsError } = await supabase.functions.invoke('send-invoice-sms', {
          body: {
            clientPhone: currentJob.client_phone,
            clientName: currentJob.client_name,
            businessName: business.name,
            invoiceUrl,
            total
          }
        })
        if (smsError) {
          console.error('send-invoice-sms failed:', smsError)
          smsFailed = true
          await supabase.from('invoices').update({ client_sms_failed: true }).eq('id', data.id)
        }
      }

      setShowInvoiceBuilder(false)
      setInvoiceItems([{ description: '', amount: '' }])
      if (smsFailed) {
        setInvoiceSmsWarning('Invoice created, but the text to the client failed to send — let your dispatcher know so they can resend it.')
      }
      await finishTheJob()
    } catch (err) {
      setInvoiceError(`Failed to send invoice: ${err.message}`)
    } finally {
      setInvoiceSubmitting(false)
    }
  }

  function handleStartTracking() {
    // Onboarding checklist (Pro tier) gates only the very first "Start
    // Tracking" — once onboarding_completed_at is set on the technician row,
    // this is skipped on every subsequent session.
    if (onboardingTemplate && !tech.onboarding_completed_at) {
      setOnboardingChecks(new Array(onboardingTemplate.items.length).fill(false))
      setShowOnboardingChecklist(true)
      return
    }
    setTracking(true)
    setStatus('tracking')
  }

  function toggleOnboardingItem(index) {
    setOnboardingChecks(prev => prev.map((checked, i) => i === index ? !checked : checked))
  }

  async function confirmOnboardingChecklist() {
    const completedAt = new Date().toISOString()
    await supabase.from('technicians').update({ onboarding_completed_at: completedAt }).eq('id', tech.id)
    setTech(prev => ({ ...prev, onboarding_completed_at: completedAt }))
    setShowOnboardingChecklist(false)
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

      {invoiceSmsWarning && (
        <div style={styles.credentialBanner}>
          <p style={styles.credentialBannerTitle}>⚠️ Invoice text failed</p>
          <p style={styles.credentialBannerLine}>{invoiceSmsWarning}</p>
          <button type="button" style={{ ...styles.btnGreySmall, marginTop: 8, padding: '4px 10px', fontSize: 12 }} onClick={() => setInvoiceSmsWarning(null)}>
            Dismiss
          </button>
        </div>
      )}

      {checklistPhotoWarning && (
        <div style={styles.credentialBanner}>
          <p style={styles.credentialBannerTitle}>⚠️ Checklist photo upload failed</p>
          <p style={styles.credentialBannerLine}>{checklistPhotoWarning}</p>
          <button type="button" style={{ ...styles.btnGreySmall, marginTop: 8, padding: '4px 10px', fontSize: 12 }} onClick={() => setChecklistPhotoWarning(null)}>
            Dismiss
          </button>
        </div>
      )}

      {/* Read-only Licence/Ticket Expiry Guardian banner — see state comment */}
      {expiringCredentials.length > 0 && (
        <div style={styles.credentialBanner}>
          <p style={styles.credentialBannerTitle}>⚠️ Licence/ticket check</p>
          {expiringCredentials.map((c, i) => {
            const daysLeft = Math.ceil((new Date(c.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            const label = daysLeft < 0 ? `expired ${Math.abs(daysLeft)}d ago` : daysLeft === 0 ? 'expires today' : `expires in ${daysLeft}d`
            return (
              <p key={i} style={styles.credentialBannerLine}>
                {c.credential_name} — {label}
              </p>
            )
          })}
        </div>
      )}

      {/* Read-only workload banner — tech.rolling_week_hours/rolling_emergency_job_count
          are computed daily by update-technician-workload, previously only shown to
          the dispatcher in DispatcherView. Never blocks any action, same pattern as
          the credentials banner above. 55h/week mirrors that function's own burnout
          threshold, so what the tech sees always matches what triggers the alert. */}
      {tech?.rolling_week_hours > 0 && (
        <div style={tech.rolling_week_hours >= 55 ? styles.burnoutBannerWarn : styles.burnoutBanner}>
          <p style={tech.rolling_week_hours >= 55 ? styles.credentialBannerTitle : styles.workloadBannerTitle}>
            {tech.rolling_week_hours >= 55 ? '⚠️ Heavy week' : '📊 This week'}
          </p>
          <p style={styles.credentialBannerLine}>
            ~{Math.round(tech.rolling_week_hours)}h logged this week
            {tech.rolling_emergency_job_count > 0 ? `, ${tech.rolling_emergency_job_count} emergency callout${tech.rolling_emergency_job_count === 1 ? '' : 's'}` : ''}
            {tech.rolling_week_hours >= 55 ? ' — talk to your manager if you need a lighter load.' : ''}
          </p>
        </div>
      )}

      {/* Current job card */}
      {currentJob && (
        <div style={styles.jobCard}>
          <p style={styles.jobLabel}>CURRENT JOB{isCrew ? ' (CREW)' : ''}</p>
          <p style={styles.clientName}>{currentJob.client_name}</p>
          <p style={styles.clientAddr}>{currentJob.client_address}</p>
          {isCrew && (
            <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
              You're helping on this job — the lead technician handles Start/Complete and invoicing.
            </p>
          )}
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

      {/* Pro-tier onboarding checklist, shown once before the first "Start Tracking" */}
      {showOnboardingChecklist && onboardingTemplate && (
        <div style={styles.invoiceCard}>
          <p style={styles.jobLabel}>{onboardingTemplate.name || 'ONBOARDING CHECKLIST'}</p>
          {onboardingTemplate.items.map((item, i) => (
            <label key={i} style={styles.checklistRow}>
              <input
                type="checkbox"
                checked={onboardingChecks[i] || false}
                onChange={() => toggleOnboardingItem(i)}
                style={{ marginRight: 10 }}
              />
              <span style={{ color: '#ccc', fontSize: 14 }}>{item}</span>
            </label>
          ))}
          <button
            type="button"
            style={styles.btnGreenSmall}
            disabled={!onboardingChecks.every(Boolean) || onboardingChecks.length === 0}
            onClick={confirmOnboardingChecklist}
          >
            Continue
          </button>
        </div>
      )}

      {/* Pro-tier compliance checklist, shown before invoicing */}
      {showChecklist && checklistTemplate && (
        <div style={styles.invoiceCard}>
          <p style={styles.jobLabel}>{checklistTemplate.name || 'COMPLETION CHECKLIST'}</p>
          {checklistTemplate.items.map((item, i) => (
            <div key={i}>
              <label style={styles.checklistRow}>
                <input
                  type="checkbox"
                  checked={checklistChecks[i] || false}
                  onChange={() => toggleChecklistItem(i)}
                  style={{ marginRight: 10 }}
                />
                <span style={{ color: '#ccc', fontSize: 14 }}>{item}</span>
              </label>
              {/* Optional photo evidence for this item — e.g. proof of "gas
                  shutoff confirmed" for a later dispute. Never required. */}
              <label style={styles.photoAttachBtn}>
                {checklistPhotos[i] ? `📷 ${checklistPhotos[i].name}` : '📷 Attach photo (optional)'}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={(e) => setChecklistPhoto(i, e.target.files?.[0] || null)}
                />
              </label>
            </div>
          ))}
          <button
            type="button"
            style={styles.btnGreenSmall}
            disabled={!checklistChecks.every(Boolean) || checklistChecks.length === 0}
            onClick={confirmChecklist}
          >
            Continue
          </button>
        </div>
      )}

      {/* Pro-tier materials-used log, shown after the checklist (if any),
          before invoicing. Optional — a job with no parts used can Skip. */}
      {showMaterials && (
        <div style={styles.invoiceCard}>
          <p style={styles.jobLabel}>MATERIALS USED (OPTIONAL)</p>
          {materialLines.map((line, i) => (
            <div key={i} style={styles.invoiceRow}>
              <select
                value={line.inventory_item_id}
                onChange={(e) => updateMaterialLine(i, 'inventory_item_id', e.target.value)}
                style={styles.materialSelect}
              >
                <option value="">Select part/material...</option>
                {inventoryItems.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.name} ({item.quantity} {item.unit || 'units'} on hand)
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                placeholder="Qty"
                value={line.quantity_used}
                onChange={(e) => updateMaterialLine(i, 'quantity_used', e.target.value)}
                style={styles.invoiceAmountInput}
              />
              {materialLines.length > 1 && (
                <button type="button" style={styles.invoiceRemoveBtn} onClick={() => removeMaterialLine(i)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" style={styles.invoiceAddBtn} onClick={addMaterialLine}>+ Add material</button>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" style={styles.btnGreySmall} onClick={skipMaterials}>Skip</button>
            <button type="button" style={styles.btnGreenSmall} onClick={confirmMaterials}>Continue</button>
          </div>
        </div>
      )}

      {/* Pro-tier invoice builder, shown after "Complete Job" is tapped */}
      {showInvoiceBuilder && (
        <div style={styles.invoiceCard}>
          <p style={styles.jobLabel}>BUILD INVOICE (OPTIONAL)</p>
          {invoiceItems.map((item, i) => (
            <div key={i} style={styles.invoiceRow}>
              <input
                type="text"
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateInvoiceItem(i, 'description', e.target.value)}
                style={styles.invoiceDescInput}
              />
              <input
                type="number"
                placeholder="$"
                value={item.amount}
                onChange={(e) => updateInvoiceItem(i, 'amount', e.target.value)}
                style={styles.invoiceAmountInput}
              />
              {invoiceItems.length > 1 && (
                <button type="button" style={styles.invoiceRemoveBtn} onClick={() => removeInvoiceItem(i)}>✕</button>
              )}
            </div>
          ))}
          <button type="button" style={styles.invoiceAddBtn} onClick={addInvoiceItem}>+ Add line item</button>
          {hasAddon(business, 'surge_pricing') && currentJob?.urgency === 'emergency' && !invoiceItems.some(i => i.description === 'Emergency callout premium') && (
            <button type="button" style={{ ...styles.invoiceAddBtn, marginLeft: 8 }} onClick={addEmergencyPremiumLine}>
              ⚡ Suggest emergency premium
            </button>
          )}
          {invoiceError && <p style={{ color: '#8A2525', fontSize: 13, margin: '10px 0 0' }}>{invoiceError}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button type="button" style={styles.btnGreySmall} onClick={skipInvoice} disabled={invoiceSubmitting}>
              Skip
            </button>
            <button type="button" style={styles.btnGreenSmall} onClick={submitInvoice} disabled={invoiceSubmitting}>
              {invoiceSubmitting ? 'Sending...' : 'Send Invoice'}
            </button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div style={styles.btnGroup}>
        {status === 'idle' && !tracking && !showOnboardingChecklist && (
          <button style={styles.btnGreen} onClick={handleStartTracking}>
            Start Tracking
          </button>
        )}
        {isCrew && currentJob && (
          <button style={styles.btnGreySmall} onClick={leaveJob} disabled={leavingJob}>
            {leavingJob ? 'Leaving...' : 'Leave job'}
          </button>
        )}
        {!isCrew && status === 'tracking' && currentJob && currentJob.status === 'scheduled' && (
          <button style={styles.btnBlue} onClick={handleStartJob}>
            Start Job
          </button>
        )}
        {!isCrew && status === 'job_active' && !showInvoiceBuilder && !showChecklist && !showMaterials && (
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
              setChecklistDone(false)
              setChecklistPhotos([])
              setMaterialsDone(false)
              setMaterialLines([{ inventory_item_id: '', quantity_used: '' }])
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
  errorBox: { background: '#FAEAEA', border: '1px solid #8A2525', borderRadius: 12, padding: 20, maxWidth: 340, textAlign: 'center' },
  invoiceCard: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, marginBottom: 20 },
  checklistRow: { display: 'flex', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1e293b', cursor: 'pointer' },
  invoiceRow: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' },
  invoiceDescInput: { flex: 2, background: '#050811', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13 },
  invoiceAmountInput: { flex: 1, background: '#050811', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13, width: 0 },
  invoiceRemoveBtn: { background: 'none', border: 'none', color: '#8A2525', fontSize: 16, cursor: 'pointer', padding: '0 4px' },
  invoiceAddBtn: { background: 'none', border: '1px dashed #2D5FA8', color: '#2D5FA8', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', width: '100%', marginTop: 4 },
  btnGreySmall: { flex: 1, background: '#1e293b', color: '#ccc', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' },
  btnGreenSmall: { flex: 2, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' },
  photoAttachBtn: { display: 'inline-block', background: '#1e293b', color: '#8899a6', border: '1px dashed #2D5FA8', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer', margin: '4px 0 8px' },
  materialSelect: { flex: 2, background: '#050811', border: '1px solid #1e293b', borderRadius: 8, padding: '10px 12px', color: '#fff', fontSize: 13 },
  credentialBanner: { background: '#2A1F0844', border: '1px solid #A87C16', borderRadius: 12, padding: '12px 16px', width: '100%', maxWidth: 360, marginBottom: 20 },
  credentialBannerTitle: { color: '#A87C16', fontSize: 13, fontWeight: 'bold', margin: '0 0 6px' },
  credentialBannerLine: { color: '#ccc', fontSize: 12, margin: '2px 0' },
  burnoutBanner: { background: '#1A1F2A44', border: '1px solid #3A4A6B', borderRadius: 12, padding: '12px 16px', width: '100%', maxWidth: 360, marginBottom: 20 },
  burnoutBannerWarn: { background: '#2A1F0844', border: '1px solid #A87C16', borderRadius: 12, padding: '12px 16px', width: '100%', maxWidth: 360, marginBottom: 20 },
  workloadBannerTitle: { color: '#7C9CD6', fontSize: 13, fontWeight: 'bold', margin: '0 0 6px' }
}
