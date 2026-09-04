import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import Map, { Marker, Popup, Source, Layer } from 'react-map-gl'
import { supabase } from '../supabaseClient'
import { timeAgo, geocodeAddress, generatePin } from '../utils'
import { MAX_ADDONS, hasAddon, isTrialing, trialDaysLeft, hasUsedTrial, enableAddonPatch, disableAddonPatch, startTrialPatch } from '../maxAddons'
import 'mapbox-gl/dist/mapbox-gl.css'

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN

export default function DispatcherView() {
  const { businessId } = useParams()
  // Agent Operating System dashboard (Phase 5) is gated behind an explicit
  // ?agents=1 URL param — see the "agents" queueTab block below for the full
  // reasoning. Not a security boundary (RLS on agent_functions/agent_insights/
  // agent_council_reports is already anon-select-all, same as every other
  // table in this app — see SECURITY_NOTES.md), just a UX/product one: this
  // data is platform-wide (every customer's automation health), not this
  // business's, so it shouldn't appear by default in a random business
  // owner's day-to-day console.
  const [searchParams] = useSearchParams()
  const showAgentsTab = searchParams.get('agents') === '1'
  const [business, setBusiness] = useState(null)
  const [technicians, setTechnicians] = useState([])
  const [jobs, setJobs] = useState([])
  const [leads, setLeads] = useState([])
  const [assets, setAssets] = useState([]) // Pro tier only
  const [invoices, setInvoices] = useState([]) // Pro tier only
  const [carbonEstimates, setCarbonEstimates] = useState([]) // Pro tier only — see estimate-job-carbon
  const [subcontractors, setSubcontractors] = useState([])
  const [showAddSubcontractor, setShowAddSubcontractor] = useState(false)
  const [newSubcontractor, setNewSubcontractor] = useState({ name: '', phone: '', skills: '', hourly_rate: '' })
  const [inventory, setInventory] = useState([]) // Pro tier only
  const [marketingDrafts, setMarketingDrafts] = useState([]) // Pro tier only — Growth pillar
  const [marketingActionId, setMarketingActionId] = useState(null) // draft id currently being approved/rejected
  const [technicianCredentials, setTechnicianCredentials] = useState([]) // Pro tier only — Licence/Ticket Expiry Guardian
  const [showAddCredential, setShowAddCredential] = useState(false)
  const [weatherDrafts, setWeatherDrafts] = useState([]) // Weather-Risk Reschedule Agent — all tiers
  const [weatherActionId, setWeatherActionId] = useState(null)
  const [wastedTripsCount, setWastedTripsCount] = useState(0) // Wasted-Trip / No-Show Proof Agent stat
  // Round-2 batch (2026-09-04): quote-to-job AI estimator — all tiers.
  const [quotes, setQuotes] = useState([])
  const [showAddQuote, setShowAddQuote] = useState(false)
  const [quoteDraft, setQuoteDraft] = useState({ client_name: '', client_phone: '', description: '' })
  const [draftingQuote, setDraftingQuote] = useState(false)
  const [sendingQuoteId, setSendingQuoteId] = useState(null)
  // Round-2 batch: multi-technician job splitting — jobId -> array of
  // job_assignments rows (each with joined technicians(name)).
  const [jobCrew, setJobCrew] = useState({})
  // Round-2 batch: customer review/reputation loop — invoiceId -> review_requests row.
  const [reviewRequests, setReviewRequests] = useState({})
  const [googleReviewLinkInput, setGoogleReviewLinkInput] = useState('')
  const [requestingReviewId, setRequestingReviewId] = useState(null)
  // Round-2 batch: seasonal demand forecasting — most recent business-scoped insight, or null.
  const [demandForecast, setDemandForecast] = useState(null)
  // Minerva Max add-on tier (2026-09-04) — gates the Minerva Max batch +
  // round-2 batch features behind per-addon enable/trial flags on
  // `businesses`. dismissedNudges holds nudge_key's the dispatcher has
  // already closed, so a usage-triggered upsell card doesn't reappear
  // every session. addonBusy is the addon key currently mid-request, to
  // disable that addon's buttons while the write is in flight.
  const [dismissedNudges, setDismissedNudges] = useState([])
  const [addonBusy, setAddonBusy] = useState(null)
  const [weatherTradesInput, setWeatherTradesInput] = useState('')
  const [metaAccessTokenInput, setMetaAccessTokenInput] = useState('')
  const [metaAdAccountIdInput, setMetaAdAccountIdInput] = useState('')
  const [metaPageIdInput, setMetaPageIdInput] = useState('')
  const [checklistTemplate, setChecklistTemplate] = useState(null) // Pro tier only
  const [showChecklistModal, setShowChecklistModal] = useState(false)
  const [onboardingTemplate, setOnboardingTemplate] = useState(null) // Pro tier only
  const [showOnboardingModal, setShowOnboardingModal] = useState(false)
  // Recently completed jobs (Pro tier) — separate from the active `jobs`
  // list above (which only ever holds scheduled/active) so the existing
  // JOBS tab count/behavior doesn't change. Lets the dispatcher expand a
  // completed job to review checklist photo evidence + materials used,
  // e.g. for a client dispute.
  const [completedJobs, setCompletedJobs] = useState([])
  const [expandedJobId, setExpandedJobId] = useState(null)
  const [jobPhotos, setJobPhotos] = useState({}) // job_id -> checklist_photos rows, fetched lazily
  const [jobMaterials, setJobMaterials] = useState({}) // job_id -> job_materials rows, fetched lazily
  const [jobIncidents, setJobIncidents] = useState({}) // job_id -> technician_incidents rows, fetched lazily
  const [incidentDraft, setIncidentDraft] = useState({ category: 'note', description: '' })
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [queueTab, setQueueTab] = useState('jobs') // 'jobs' | 'leads' | 'assets' | 'invoices' | 'inventory' | 'marketing' | 'credentials' | 'weather' | 'payroll' | 'agents'
  // Payroll v1 (Pro tier) — hours-worked CSV export only, computed on-demand
  // for an owner-chosen date range (not pre-fetched, since technician_locations
  // can be large). Same GPS-breadcrumb estimate logic as update-technician-workload's
  // rolling_week_hours, just generalized to a custom range. Deliberately does NOT
  // calculate PAYG/super/award rates or pay dollar amounts — see README/memory
  // scope note: this is a raw-hours export for the owner's own accountant/payroll
  // software, not an in-app payroll engine.
  const today = new Date().toISOString().slice(0, 10)
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const [payrollStart, setPayrollStart] = useState(fourteenDaysAgo)
  const [payrollEnd, setPayrollEnd] = useState(today)
  const [payrollRows, setPayrollRows] = useState(null) // null = not yet generated for current range
  const [payrollLoading, setPayrollLoading] = useState(false)
  // Agent Operating System dashboard (Phase 5) — platform-wide, read-only.
  // Lazy-loaded (see useEffect below) so these 3 queries only fire if/when
  // someone actually opens the tab, not on every DispatcherView mount.
  const [agentFunctions, setAgentFunctions] = useState([])
  const [agentInsights, setAgentInsights] = useState([])
  const [agentInsightsCount, setAgentInsightsCount] = useState(0) // total in last 7d, unlimited (agentInsights list itself is capped at 20 for display)
  const [agentCouncilReport, setAgentCouncilReport] = useState(null)
  const [agentDataLoaded, setAgentDataLoaded] = useState(false)
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [showAddInventory, setShowAddInventory] = useState(false)
  const [selected, setSelected] = useState(null) // selected technician
  const [showTrail, setShowTrail] = useState(false) // today's GPS breadcrumb trail for `selected`
  const [trailPoints, setTrailPoints] = useState([]) // [{lat,lng,recorded_at}]
  const [showAddJob, setShowAddJob] = useState(false)
  const [showAddTech, setShowAddTech] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const [calendarLinkCopied, setCalendarLinkCopied] = useState(false)
  const [slackWebhookInput, setSlackWebhookInput] = useState('')
  const [savingSettings, setSavingSettings] = useState(false)
  const [viewState, setViewState] = useState({
    latitude: -33.87,
    longitude: 151.21,
    zoom: 11,
    pitch: 45,
    bearing: -10
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
    setSlackWebhookInput(biz?.slack_webhook_url || '')
    setGoogleReviewLinkInput(biz?.google_review_link || '')
    setMetaAccessTokenInput(biz?.meta_access_token || '')
    setMetaAdAccountIdInput(biz?.meta_ad_account_id || '')
    setMetaPageIdInput(biz?.meta_page_id || '')
    setWeatherTradesInput((biz?.weather_sensitive_trade_types || []).join(', '))
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

    const { data: leadList } = await supabase
      .from('leads')
      .select('*')
      .eq('business_id', businessId)
      .in('status', ['new', 'contacted', 'quoted'])
      .order('score', { ascending: false, nullsFirst: false })
    setLeads(leadList || [])

    const { data: subList } = await supabase
      .from('subcontractors')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
    setSubcontractors(subList || [])

    // Quote-to-job AI estimator — all tiers, front-desk feature.
    const { data: quoteList } = await supabase
      .from('quotes')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(50)
    setQuotes(quoteList || [])

    // Multi-technician job splitting — crew assignments for the currently
    // active/scheduled jobs, grouped by job_id.
    const { data: crewList } = await supabase
      .from('job_assignments')
      .select('*, technicians(name)')
      .eq('business_id', businessId)
    const crewByJob = {}
    for (const row of crewList || []) {
      if (!crewByJob[row.job_id]) crewByJob[row.job_id] = []
      crewByJob[row.job_id].push(row)
    }
    setJobCrew(crewByJob)

    // Seasonal demand forecasting — most recent business-scoped insight, if any.
    const { data: forecastInsight } = await supabase
      .from('agent_insights')
      .select('*')
      .eq('business_id', businessId)
      .eq('insight_type', 'demand_forecast')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setDemandForecast(forecastInsight || null)

    // Minerva Max — nudge cards the dispatcher has already dismissed.
    const { data: dismissedList } = await supabase
      .from('upsell_nudge_dismissals')
      .select('nudge_key')
      .eq('business_id', businessId)
    setDismissedNudges((dismissedList || []).map(d => d.nudge_key))

    // Asset tracking is a Pro-tier feature — skip the query entirely for
    // other tiers rather than fetching data the UI will never show.
    if (biz?.subscription_tier === 'pro') {
      const { data: assetList } = await supabase
        .from('assets')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
      setAssets(assetList || [])

      const { data: invoiceList } = await supabase
        .from('invoices')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
      setInvoices(invoiceList || [])

      // Customer review/reputation loop — review_requests keyed by invoice_id
      // so the Invoices tab can show "Request Review" only where it hasn't
      // been sent yet.
      const { data: reviewReqList } = await supabase
        .from('review_requests')
        .select('*')
        .eq('business_id', businessId)
      const reviewByInvoice = {}
      for (const row of reviewReqList || []) {
        if (row.invoice_id) reviewByInvoice[row.invoice_id] = row
      }
      setReviewRequests(reviewByInvoice)

      const { data: carbonList } = await supabase
        .from('carbon_estimates')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
        .limit(90) // roughly a quarter's worth of daily technician-day rows
      setCarbonEstimates(carbonList || [])

      const { data: template } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('business_id', businessId)
        .eq('type', 'completion')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setChecklistTemplate(template || null)

      const { data: onboardingTpl } = await supabase
        .from('checklist_templates')
        .select('*')
        .eq('business_id', businessId)
        .eq('type', 'onboarding')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setOnboardingTemplate(onboardingTpl || null)

      const { data: inventoryList } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('business_id', businessId)
        .order('name', { ascending: true })
      setInventory(inventoryList || [])

      const { data: marketingDraftList } = await supabase
        .from('marketing_drafts')
        .select('*')
        .eq('business_id', businessId)
        .order('created_at', { ascending: false })
      setMarketingDrafts(marketingDraftList || [])

      // Recently completed jobs, for the checklist-photo/materials review
      // strip below — kept separate from the active `jobs` query above.
      const { data: completedJobList } = await supabase
        .from('jobs')
        .select('*')
        .eq('business_id', businessId)
        .eq('status', 'complete')
        .order('completed_at', { ascending: false })
        .limit(20)
      setCompletedJobs(completedJobList || [])

      // Licence/Ticket Expiry Guardian — Pro tier only.
      const { data: credentialList } = await supabase
        .from('technician_credentials')
        .select('*, technicians(name)')
        .eq('business_id', businessId)
        .order('expiry_date', { ascending: true })
      setTechnicianCredentials(credentialList || [])
    }

    // Weather-Risk Reschedule Agent drafts — not Pro-gated (safety concern,
    // not a growth feature), but simply empty/inert for a business that
    // hasn't set weather_sensitive_trade_types in Settings.
    const { data: weatherDraftList } = await supabase
      .from('weather_reschedule_drafts')
      .select('*, jobs(client_name, client_address, scheduled_time)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
    setWeatherDrafts(weatherDraftList || [])

    // Wasted-Trip / No-Show Proof Agent stat — count of jobs flagged this
    // calendar month.
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const { count: noShowCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .not('no_show_detected_at', 'is', null)
      .gte('no_show_detected_at', monthStart.toISOString())
    setWastedTripsCount(noShowCount ?? 0)
  }

  // Lazy-loads checklist photo evidence + materials used for a completed
  // job only when the dispatcher actually expands it — avoids pulling
  // photos/materials for every completed job on every page load.
  async function toggleJobDetails(jobId) {
    if (expandedJobId === jobId) { setExpandedJobId(null); return }
    setExpandedJobId(jobId)
    if (!jobPhotos[jobId]) {
      const { data, error } = await supabase
        .from('checklist_photos')
        .select('*')
        .eq('job_id', jobId)
      if (error) console.error('checklist_photos fetch failed', error)
      setJobPhotos(prev => ({ ...prev, [jobId]: data || [] }))
    }
    if (!jobMaterials[jobId]) {
      const { data, error } = await supabase
        .from('job_materials')
        .select('*')
        .eq('job_id', jobId)
      if (error) console.error('job_materials fetch failed', error)
      setJobMaterials(prev => ({ ...prev, [jobId]: data || [] }))
    }
    if (!jobIncidents[jobId]) {
      const { data, error } = await supabase
        .from('technician_incidents')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
      if (error) console.error('technician_incidents fetch failed', error)
      setJobIncidents(prev => ({ ...prev, [jobId]: data || [] }))
    }
  }

  // Crew Coordination accountability log — dispatcher-side quick-add for a
  // dispute, near-miss, note, or commendation tied to a completed job. Table
  // + RLS/grants already existed (Track A, 2026-09-01) but had no UI until now.
  async function addIncident(job) {
    const description = incidentDraft.description.trim()
    if (!description) return
    const { data, error } = await supabase
      .from('technician_incidents')
      .insert({
        business_id: businessId,
        technician_id: job.technician_id || null,
        job_id: job.id,
        category: incidentDraft.category,
        description,
        reported_by: 'dispatcher'
      })
      .select()
      .single()
    if (error) { console.error('addIncident failed', error); return }
    setJobIncidents(prev => ({ ...prev, [job.id]: [data, ...(prev[job.id] || [])] }))
    setIncidentDraft({ category: 'note', description: '' })
  }

  // Agent Operating System dashboard (Phase 5) — lazy-loads its 3 queries
  // only the first time the "agents" tab is actually opened, same "don't
  // fetch data the UI isn't showing yet" instinct as toggleJobDetails above.
  // Guarded by agentDataLoaded so re-clicking the tab doesn't refetch.
  useEffect(() => {
    if (queueTab === 'agents' && !agentDataLoaded) {
      loadAgentOpsData()
    }
  }, [queueTab])

  async function loadAgentOpsData() {
    setAgentDataLoaded(true)

    const { data: fns, error: fnsError } = await supabase
      .from('agent_functions')
      .select('*')
    if (fnsError) console.error('agent_functions fetch failed', fnsError)
    setAgentFunctions(fns || [])

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

    const { count: insightsCount, error: insightsCountError } = await supabase
      .from('agent_insights')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo)
    if (insightsCountError) console.error('agent_insights count failed', insightsCountError)
    setAgentInsightsCount(insightsCount ?? 0)

    const { data: insights, error: insightsError } = await supabase
      .from('agent_insights')
      .select('*')
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(20)
    if (insightsError) console.error('agent_insights fetch failed', insightsError)
    setAgentInsights(insights || [])

    const { data: report, error: reportError } = await supabase
      .from('agent_council_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (reportError) console.error('agent_council_reports fetch failed', reportError)
    setAgentCouncilReport(report || null)
  }

  // Flips agent_functions.enabled for one row (operator-only Agent Ops
  // toggle, added 2026-09-02 — see KILL_SWITCH_GATED_FUNCTIONS above).
  // Optimistic-ish: only updates local state after the write succeeds, so
  // a failed update just silently leaves the toggle where it was rather
  // than lying about the row's real state.
  async function toggleAgentFunction(fn) {
    const { error } = await supabase
      .from('agent_functions')
      .update({ enabled: !fn.enabled })
      .eq('id', fn.id)
    if (error) { console.error('agent_functions toggle failed', error); return }
    setAgentFunctions(prev => prev.map(f => f.id === fn.id ? { ...f, enabled: !f.enabled } : f))
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
      // New leads land here the moment the AI Intake Assistant captures one —
      // no refresh needed to see them show up in the Leads tab.
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'leads',
        filter: `business_id=eq.${businessId}`
      }, (payload) => {
        setLeads(prev => [payload.new, ...prev].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)))
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [businessId])

  // Fetch today's GPS breadcrumb trail for the selected technician, only
  // when the dispatcher actually asks to see it (avoids pulling a full
  // day of points for every technician on every selection).
  useEffect(() => {
    if (!selected || !showTrail) { setTrailPoints([]); return }
    let cancelled = false
    const midnight = new Date(); midnight.setHours(0, 0, 0, 0)
    supabase
      .from('technician_locations')
      .select('lat, lng, recorded_at')
      .eq('technician_id', selected.id)
      .gte('recorded_at', midnight.toISOString())
      .order('recorded_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) { console.error('trail fetch failed', error); return }
        setTrailPoints(data || [])
      })
    return () => { cancelled = true }
  }, [selected, showTrail])

  // Assign job to technician
  async function assignJob(jobId, techId) {
    const previousTechId = jobs.find(j => j.id === jobId)?.technician_id || null
    await supabase.from('jobs').update({ technician_id: techId }).eq('id', jobId)
    await supabase.from('technicians').update({ current_job_id: jobId }).eq('id', techId)
    // Fire-and-forget — never blocks the assignment itself on SMS delivery.
    supabase.functions.invoke('send-job-assignment-sms', {
      body: { jobId, technicianId: techId, previousTechnicianId: previousTechId && previousTechId !== techId ? previousTechId : undefined },
    }).catch(() => {})
    await loadAll()
  }

  async function assignJobSubcontractor(jobId, subcontractorId) {
    await supabase.from('jobs').update({ assigned_subcontractor_id: subcontractorId }).eq('id', jobId)
    await loadAll()
  }

  // Multi-technician job splitting — crew members get their own
  // current_job_id pointed at the shared job (that's what drives what
  // TechnicianView shows them), but jobs.technician_id (the "lead") is left
  // untouched so existing payroll/GPS/hours logic keeps working unchanged.
  async function addCrewMember(jobId, techId) {
    if (!techId) return
    // Backend also enforces this (a before-insert trigger on job_assignments
    // checks the crew_splitting addon) since this insert goes straight from
    // the browser with no edge function in between — this UI check is a
    // fast path, the trigger is the real gate.
    const { error } = await supabase.from('job_assignments').insert({ job_id: jobId, business_id: businessId, technician_id: techId, role: 'crew' })
    if (error) {
      alert(error.message.includes('crew_splitting') ? error.message : 'Could not add crew member: ' + error.message)
      return
    }
    await supabase.from('technicians').update({ current_job_id: jobId }).eq('id', techId)
    await loadAll()
  }

  async function removeCrewMember(assignmentId, techId) {
    await supabase.from('job_assignments').delete().eq('id', assignmentId)
    // Only clear current_job_id if it's still pointing at the job they're
    // being removed from — avoids clobbering a tech who's since moved on.
    const tech = technicians.find(t => t.id === techId)
    const job = Object.values(jobCrew).flat().find(a => a.id === assignmentId)
    if (tech && job && tech.current_job_id === job.job_id) {
      await supabase.from('technicians').update({ current_job_id: null }).eq('id', techId)
    }
    await loadAll()
  }

  // Quote-to-job AI estimator — calls draft-quote (Claude-drafted line items
  // with an honest deterministic fallback), then refreshes the list.
  async function createQuote() {
    if (!quoteDraft.description.trim()) return
    setDraftingQuote(true)
    try {
      const { data, error } = await supabase.functions.invoke('draft-quote', {
        body: {
          businessId,
          description: quoteDraft.description.trim(),
          clientName: quoteDraft.client_name.trim() || null,
          clientPhone: quoteDraft.client_phone.trim() || null,
        },
      })
      if (error || data?.error) throw new Error(data?.error || error.message)
      setQuoteDraft({ client_name: '', client_phone: '', description: '' })
      setShowAddQuote(false)
      await loadAll()
    } catch (err) {
      alert(`Couldn't draft quote: ${err.message}`)
    } finally {
      setDraftingQuote(false)
    }
  }

  async function sendQuoteToClient(quoteId) {
    setSendingQuoteId(quoteId)
    try {
      const { data, error } = await supabase.functions.invoke('send-quote-sms', { body: { quoteId } })
      if (error || data?.error) throw new Error(data?.error || error.message)
      await loadAll()
    } catch (err) {
      alert(`Couldn't send quote: ${err.message}`)
    } finally {
      setSendingQuoteId(null)
    }
  }

  // Customer review/reputation loop — human-approval-per-send, same as every
  // other Sales & Marketing message: only fires on this explicit click.
  async function requestReview(invoiceId) {
    setRequestingReviewId(invoiceId)
    try {
      const { data, error } = await supabase.functions.invoke('send-review-request-sms', { body: { invoiceId } })
      if (error || data?.error) throw new Error(data?.error || error.message)
      await loadAll()
    } catch (err) {
      alert(`Couldn't send review request: ${err.message}`)
    } finally {
      setRequestingReviewId(null)
    }
  }

  // Lead pipeline actions
  async function markLeadStatus(leadId, status) {
    await supabase.from('leads').update({ status }).eq('id', leadId)
    setLeads(prev => prev.filter(l => l.id !== leadId)) // leaves the active pipeline view
  }

  async function convertLeadToJob(lead) {
    try {
      const { lat, lng } = await geocodeAddress(`${lead.suburb}, Australia`)
      await supabase.from('jobs').insert({
        business_id: businessId,
        client_name: lead.client_name,
        client_phone: lead.client_phone,
        client_address: lead.suburb,
        client_lat: lat,
        client_lng: lng,
        notes: lead.job_description,
        status: 'scheduled',
        // Carries the lead's urgency onto the job it becomes — see
        // jobs.urgency comment in supabase_schema.sql (Fair-Rotation /
        // Burnout Guard needs to know which jobs were emergencies, and
        // jobs created directly via "Add Job" have no lead to inherit
        // this from).
        urgency: lead.urgency || null
      })
      await supabase.from('leads').update({ status: 'converted' }).eq('id', lead.id)
      setLeads(prev => prev.filter(l => l.id !== lead.id))
      await loadAll()
    } catch (err) {
      alert(`Couldn't convert lead: ${err.message}`)
    }
  }

  async function assignAsset(assetId, techId) {
    await supabase.from('assets').update({ assigned_technician_id: techId || null, status: techId ? 'in_use' : 'available' }).eq('id', assetId)
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, assigned_technician_id: techId || null, status: techId ? 'in_use' : 'available' } : a))
  }

  async function setAssetStatus(assetId, status) {
    await supabase.from('assets').update({ status }).eq('id', assetId)
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, status } : a))
  }

  // Quantity edits clear any pending low-stock alert flag if the new count
  // is back above threshold, so check-inventory-levels will alert again on
  // a future dip rather than staying silently suppressed.
  async function updateInventoryQty(itemId, newQty) {
    const qty = Math.max(0, Number(newQty) || 0)
    const item = inventory.find(i => i.id === itemId)
    const clearAlert = item && qty > (item.reorder_threshold ?? 0)
    const update = clearAlert ? { quantity: qty, low_stock_alert_sent_at: null } : { quantity: qty }
    await supabase.from('inventory_items').update(update).eq('id', itemId)
    setInventory(prev => prev.map(i => i.id === itemId ? { ...i, ...update } : i))
  }

  // Invoices are marked paid manually — Minerva doesn't collect payment
  // itself (see InvoiceView.jsx), the business takes payment on-site
  // (EFTPOS, cash, etc.) and records it here once received.
  async function markInvoicePaid(invoiceId) {
    const paidAt = new Date().toISOString()
    await supabase.from('invoices').update({ status: 'paid', paid_at: paidAt }).eq('id', invoiceId)
    setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: 'paid', paid_at: paidAt } : i))
    // Paid-Invoice Referral Loop: fire-and-forget, same invocation pattern
    // as sync-technician-billing below. Generates a referral code (once,
    // idempotent inside the function) and texts it to the client — never
    // blocks the "mark paid" click.
    supabase.functions.invoke('send-referral-code-sms', { body: { invoiceId } }).catch(() => {})
    // Custom Workflows: fire the 'invoice.paid' trigger for this business, if any are configured.
    const invoice = invoices.find(i => i.id === invoiceId)
    supabase.functions.invoke('run-custom-workflows', {
      body: { businessId: business?.id, event: 'invoice.paid', payload: { total: invoice?.total, client_name: invoice?.client_name } },
    }).catch(() => {})
  }

  // Void an invoice created by mistake. Deliberately NOT a real delete —
  // there's no delete RLS policy on invoices at all (see supabase_schema.sql),
  // so hard-deleting was never actually possible via the anon key. This adds
  // the correction path that was genuinely missing (previously "Mark paid"
  // was the only action available) as a soft delete with a required reason,
  // so a voided invoice is always explainable later rather than silently
  // gone. Voided invoices fall out of chase-unpaid-invoices automatically
  // (it only queries status = 'unpaid').
  async function voidInvoice(invoiceId) {
    const reason = window.prompt('Why is this invoice being voided? (shown in the audit trail, e.g. "created by mistake" or "duplicate")')
    if (reason === null) return // cancelled
    const voidedAt = new Date().toISOString()
    await supabase.from('invoices').update({ status: 'void', voided_at: voidedAt, voided_reason: reason || null }).eq('id', invoiceId)
    setInvoices(prev => prev.map(i => i.id === invoiceId ? { ...i, status: 'void', voided_at: voidedAt, voided_reason: reason || null } : i))
  }

  function copyIntakeLink() {
    navigator.clipboard.writeText(`${window.location.origin}/intake/${businessId}`)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 2000)
  }

  function copyCalendarLink() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    navigator.clipboard.writeText(`${supabaseUrl}/functions/v1/calendar-feed?businessId=${businessId}`)
    setCalendarLinkCopied(true)
    setTimeout(() => setCalendarLinkCopied(false), 2000)
  }

  async function saveSettings({ slackWebhookUrl, autoDispatchEnabled, metaAccessToken, metaAdAccountId, metaPageId, weatherSensitiveTradeTypes, googleReviewLink }) {
    setSavingSettings(true)
    const { data } = await supabase
      .from('businesses')
      .update({
        slack_webhook_url: slackWebhookUrl || null,
        auto_dispatch_enabled: autoDispatchEnabled,
        meta_access_token: metaAccessToken || null,
        meta_ad_account_id: metaAdAccountId || null,
        meta_page_id: metaPageId || null,
        weather_sensitive_trade_types: weatherSensitiveTradeTypes && weatherSensitiveTradeTypes.length ? weatherSensitiveTradeTypes : null,
        google_review_link: googleReviewLink || null,
      })
      .eq('id', businessId)
      .select()
      .single()
    if (data) setBusiness(data)
    setSavingSettings(false)
  }

  // Weather-Risk Reschedule Agent — human-approval-gate handlers, same
  // pattern as approveDraft/rejectDraft for the Growth pillar above.
  async function approveWeatherDraft(draft) {
    setWeatherActionId(draft.id)
    try {
      const { data, error } = await supabase.functions.invoke('send-weather-reschedule-sms', { body: { draftId: draft.id } })
      if (error || data?.error) throw new Error(data?.error || error.message)
      await loadAll()
    } catch (err) {
      alert(`Failed to send: ${err.message}`)
      await loadAll()
    } finally {
      setWeatherActionId(null)
    }
  }

  async function dismissWeatherDraft(draftId) {
    setWeatherActionId(draftId)
    await supabase
      .from('weather_reschedule_drafts')
      .update({ status: 'dismissed', reviewed_at: new Date().toISOString() })
      .eq('id', draftId)
    await loadAll()
    setWeatherActionId(null)
  }

  // Growth pillar — approve/reject handlers for marketing_drafts. Approving
  // is the ONE moment a human click triggers real spend (ad_campaign) or an
  // outbound message (outreach_sms) — everything upstream (drafting) ran
  // autonomously, everything from here is a single synchronous function call.
  async function approveDraft(draft) {
    setMarketingActionId(draft.id)
    try {
      const fn = draft.type === 'ad_campaign' ? 'launch-ad-campaign' : 'send-growth-message'
      const { data, error } = await supabase.functions.invoke(fn, { body: { draftId: draft.id } })
      if (error || data?.error) throw new Error(data?.error || error.message)
      await loadAll()
    } catch (err) {
      alert(`Failed to approve: ${err.message}`)
      await loadAll()
    } finally {
      setMarketingActionId(null)
    }
  }

  async function rejectDraft(draftId) {
    setMarketingActionId(draftId)
    await supabase
      .from('marketing_drafts')
      .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
      .eq('id', draftId)
    await loadAll()
    setMarketingActionId(null)
  }

  // Client-side CSV export — no backend involved. Lets the business owner
  // import records into Xero/QuickBooks/Excel manually, or just keep an
  // offline record for compliance/bookkeeping purposes. Full native
  // accounting-software sync would require the owner to register their own
  // developer app with that provider (see README.md) — this is the
  // zero-setup alternative.
  function exportCSV(headers, rows, filenamePrefix) {
    const csv = [headers, ...rows]
      .map(row => row.map(field => `"${String(field ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function exportInvoicesCSV() {
    exportCSV(
      ['Date', 'Client Name', 'Client Phone', 'Subtotal', 'GST', 'Total', 'Status', 'Paid At'],
      invoices.map(inv => [
        new Date(inv.created_at).toLocaleDateString('en-AU'),
        inv.client_name, inv.client_phone, inv.subtotal, inv.gst, inv.total, inv.status,
        inv.paid_at ? new Date(inv.paid_at).toLocaleDateString('en-AU') : ''
      ]),
      'minerva-invoices'
    )
  }

  // Estimate only — see estimate-job-carbon/index.ts header for exactly
  // what this is and isn't (transit-only, straight-line distance, static
  // reference factor). Not a certified emissions audit.
  function exportCarbonCSV() {
    exportCSV(
      ['Date', 'Distance (km, straight-line estimate)', 'Vehicle Type', 'Estimated kg CO2-e', 'Factor Basis'],
      carbonEstimates.map(c => [
        new Date(c.created_at).toLocaleDateString('en-AU'),
        c.distance_km, c.vehicle_type, c.estimated_kg_co2e, c.factor_basis
      ]),
      'minerva-carbon-estimate'
    )
  }

  async function addSubcontractor() {
    const name = newSubcontractor.name.trim()
    if (!name) return
    const { data, error } = await supabase.from('subcontractors').insert({
      business_id: businessId,
      name,
      phone: newSubcontractor.phone.trim() || null,
      skills: newSubcontractor.skills.split(',').map(s => s.trim()).filter(Boolean),
      hourly_rate: newSubcontractor.hourly_rate ? Number(newSubcontractor.hourly_rate) : null,
    }).select().single()
    if (error) { console.error('addSubcontractor failed', error); return }
    setSubcontractors(prev => [...prev, data])
    setNewSubcontractor({ name: '', phone: '', skills: '', hourly_rate: '' })
    setShowAddSubcontractor(false)
  }

  async function removeSubcontractor(id) {
    await supabase.from('subcontractors').update({ is_active: false }).eq('id', id)
    setSubcontractors(prev => prev.filter(s => s.id !== id))
  }

  async function syncInvoiceToXero(invoiceId) {
    const { data, error } = await supabase.functions.invoke('xero-sync-invoice', { body: { invoiceId } })
    if (error || data?.error) {
      alert(`Xero sync failed: ${data?.error || error.message}`)
      return
    }
    await loadAll()
  }

  // Minerva Max add-on management — see src/maxAddons.js. Enabling/trialing
  // just flips a jsonb flag on `businesses`; no real billing wired yet (see
  // honest-scope note in supabase_schema_delta_minerva_max_tier.sql).
  async function enableMaxAddon(key) {
    setAddonBusy(key)
    const { data } = await supabase.from('businesses').update(enableAddonPatch(business, key)).eq('id', businessId).select().single()
    if (data) setBusiness(data)
    setAddonBusy(null)
  }

  async function startMaxAddonTrial(key) {
    setAddonBusy(key)
    const { data } = await supabase.from('businesses').update(startTrialPatch(business, key)).eq('id', businessId).select().single()
    if (data) setBusiness(data)
    setAddonBusy(null)
  }

  async function disableMaxAddon(key) {
    setAddonBusy(key)
    const { data } = await supabase.from('businesses').update(disableAddonPatch(business, key)).eq('id', businessId).select().single()
    if (data) setBusiness(data)
    setAddonBusy(null)
  }

  async function dismissNudge(nudgeKey) {
    setDismissedNudges(prev => [...prev, nudgeKey])
    await supabase.from('upsell_nudge_dismissals').insert({ business_id: businessId, nudge_key: nudgeKey })
  }

  // Usage-triggered upsell nudges — computed from data this dispatcher
  // already has, not a generic "upgrade now" pitch. Each nudge names a real
  // number pulled from this business's own jobs/invoices/leads so the offer
  // is concrete, not a hypothetical. See product discussion this session
  // for why trigger-based, not cold-bundle, upsell is the realistic path.
  function computeUpsellNudges() {
    const nudges = []

    if (!hasAddon(business, 'surge_pricing')) {
      let missed = 0, count = 0
      for (const job of completedJobs) {
        if (job.urgency !== 'emergency') continue
        const inv = invoices.find(i => i.job_id === job.id)
        if (!inv) continue
        const hasLine = (inv.line_items || []).some(li => li.description === 'Emergency callout premium')
        if (hasLine) continue
        const when = new Date(job.completed_at || job.scheduled_time || job.created_at)
        const hour = when.getHours(), day = when.getDay()
        missed += 75 + (hour < 7 || hour >= 18 ? 50 : 0) + (day === 0 || day === 6 ? 50 : 0)
        count++
      }
      if (count > 0) {
        nudges.push({ key: 'surge_pricing', text: `You've left an estimated $${missed} in after-hours/weekend premiums unclaimed across ${count} emergency job${count === 1 ? '' : 's'}.` })
      }
    }

    if (!hasAddon(business, 'ai_quotes') && leads.length >= 3 && quotes.length === 0) {
      nudges.push({ key: 'ai_quotes', text: `You have ${leads.length} open leads and haven't sent a single quote yet — AI Quote Drafting turns a description into a sendable quote in seconds.` })
    }

    if (!hasAddon(business, 'crew_splitting') && technicians.length >= 2 && Object.keys(jobCrew).length === 0) {
      nudges.push({ key: 'crew_splitting', text: `You have ${technicians.length} technicians — splitting a job across crew lets you take on jobs a single tech can't handle alone.` })
    }

    const paidInvoices = invoices.filter(i => i.status === 'paid')
    if (!hasAddon(business, 'review_loop') && paidInvoices.length >= 3) {
      nudges.push({ key: 'review_loop', text: `You have ${paidInvoices.length} paid invoices and no review requests sent — that's reputation you're leaving on the table.` })
    }

    if (!hasAddon(business, 'xero_sync') && paidInvoices.length >= 5) {
      nudges.push({ key: 'xero_sync', text: `You've got ${paidInvoices.length} paid invoices to reconcile by hand — Xero Sync pushes them across as drafts automatically.` })
    }

    if (!hasAddon(business, 'subcontractor_pool') && subcontractors.length === 0 &&
      jobs.filter(j => j.status === 'scheduled' && !j.technician_id && !j.assigned_subcontractor_id).length >= 2) {
      nudges.push({ key: 'subcontractor_pool', text: `You have unassigned jobs sitting in the queue — a subcontractor pool lets you cover overflow without hiring.` })
    }

    return nudges.filter(n => !dismissedNudges.includes(n.key))
  }

  // Shared "this is a Minerva Max add-on" lock card, shown in place of a
  // gated feature's content/tab when its addon isn't enabled/trialing.
  function addonLockCard(key) {
    const meta = MAX_ADDONS.find(a => a.key === key)
    if (!meta) return null
    return (
      <div style={{ ...styles.jobRow, textAlign: 'center', padding: 24 }}>
        <p style={{ color: '#fff', fontSize: 14, fontWeight: 'bold', margin: '0 0 6px' }}>🔒 {meta.name} is a Minerva Max add-on</p>
        <p style={{ color: '#888', fontSize: 13, margin: '0 0 14px' }}>{meta.description}</p>
        <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
          <button style={styles.leadActionPrimary} disabled={addonBusy === key} onClick={() => enableMaxAddon(key)}>
            {addonBusy === key ? 'Working…' : `Enable — $${meta.price}/mo`}
          </button>
          {!hasUsedTrial(business, key) && (
            <button style={styles.leadActionSecondary} disabled={addonBusy === key} onClick={() => startMaxAddonTrial(key)}>
              Try free for 30 days
            </button>
          )}
        </div>
      </div>
    )
  }

  function exportJobsCSV() {
    exportCSV(
      ['Created', 'Scheduled', 'Client Name', 'Client Phone', 'Client Address', 'Status', 'Started', 'Completed', 'Notes'],
      jobs.map(j => [
        new Date(j.created_at).toLocaleDateString('en-AU'),
        j.scheduled_time ? new Date(j.scheduled_time).toLocaleString('en-AU') : '',
        j.client_name, j.client_phone, j.client_address, j.status,
        j.started_at ? new Date(j.started_at).toLocaleString('en-AU') : '',
        j.completed_at ? new Date(j.completed_at).toLocaleString('en-AU') : '',
        j.notes
      ]),
      'minerva-jobs'
    )
  }

  function exportLeadsCSV() {
    exportCSV(
      ['Created', 'Client Name', 'Client Phone', 'Suburb', 'Urgency', 'Job Description', 'Score', 'Status'],
      leads.map(l => [
        new Date(l.created_at).toLocaleDateString('en-AU'),
        l.client_name, l.client_phone, l.suburb, l.urgency, l.job_description, l.score, l.status
      ]),
      'minerva-leads'
    )
  }

  // Payroll v1: fetches technician_locations for the chosen date range and
  // buckets hours the same way update-technician-workload does (per
  // calendar day, sum of max-min recorded_at), just per-technician for a
  // custom range instead of a fixed rolling 7 days. Explicit "Generate"
  // click rather than auto-loading on tab open, since a wide date range on
  // a business with many technicians/months of history could be a large
  // query — the owner picks a range and asks for it.
  async function generatePayrollHours() {
    if (!payrollStart || !payrollEnd) return
    setPayrollLoading(true)
    setPayrollRows(null)
    const startIso = new Date(payrollStart + 'T00:00:00').toISOString()
    const endIso = new Date(payrollEnd + 'T23:59:59.999').toISOString()

    const { data: locations, error } = await supabase
      .from('technician_locations')
      .select('technician_id, recorded_at')
      .eq('business_id', businessId)
      .gte('recorded_at', startIso)
      .lte('recorded_at', endIso)
    if (error) { console.error('payroll locations fetch failed', error); setPayrollLoading(false); return }

    const byTech = {}
    for (const loc of locations || []) {
      const day = loc.recorded_at.slice(0, 10)
      const t = new Date(loc.recorded_at).getTime()
      if (!byTech[loc.technician_id]) byTech[loc.technician_id] = {}
      const days = byTech[loc.technician_id]
      if (!days[day]) days[day] = { min: t, max: t }
      else { days[day].min = Math.min(days[day].min, t); days[day].max = Math.max(days[day].max, t) }
    }

    const rows = technicians.map(tech => {
      const days = byTech[tech.id] || {}
      const dayKeys = Object.keys(days)
      let totalHours = 0
      for (const d of dayKeys) totalHours += (days[d].max - days[d].min) / (1000 * 60 * 60)
      return { id: tech.id, name: tech.name, hours: Math.round(totalHours * 10) / 10, daysActive: dayKeys.length }
    })
    setPayrollRows(rows)
    setPayrollLoading(false)
  }

  function exportPayrollCSV() {
    if (!payrollRows) return
    exportCSV(
      ['Technician', 'Estimated Hours', 'Days With GPS Activity', 'Period Start', 'Period End'],
      payrollRows.map(r => [r.name, r.hours, r.daysActive, payrollStart, payrollEnd]),
      'minerva-payroll'
    )
  }

  // Deactivating removes a technician from active duty (they no longer show
  // on the map or count toward billing). Kept as a soft-delete (is_active =
  // false) rather than a hard delete, so job history stays intact.
  async function deactivateTech(techId) {
    if (!confirm('Remove this technician? They will stop appearing on the map and you will no longer be billed for them.')) return
    await supabase.from('technicians').update({ is_active: false }).eq('id', techId)
    setTechnicians(prev => prev.filter(t => t.id !== techId))
    // Recompute billed quantity now that the roster shrank. Fire-and-forget,
    // same as the technician-side sync call — never blocks the UI.
    supabase.functions.invoke('sync-technician-billing', { body: { businessId } }).catch(() => {})
  }

  const techColors = ['#2D5FA8','#1D9E75','#A87C16','#8A2525','#534AB7','#185FA5']

  // Agent Operating System dashboard (Phase 5) — derived view state, computed
  // fresh each render from the lazily-loaded agentFunctions/agentInsights
  // state above (cheap — at most a few dozen rows).
  const AGENT_GROUPS = ['outreach', 'marketing', 'scheduling', 'finance', 'core', 'research', 'design']
  const NOT_YET_BUILT_AGENTS = ['research', 'design'] // per Phase 1 seed data — no rows exist for these yet
  // The truly autonomous cron-scheduled functions that check
  // agent_functions.enabled at the top of every run (added 2026-09-02;
  // extended 2026-09-05 to the industrial sector's pure cron sweeps).
  // auto-assign-technician (event-driven, no safe disable mid-dispatch),
  // launch-ad-campaign / send-growth-message (human-click-triggered only),
  // test-agent-health (the health monitor itself), industrial-conductor /
  // enrich-industrial-leads (dual-mode — also directly invoked, same
  // no-safe-mid-action caution as auto-assign-technician), and the two
  // external-ingestion webhooks (harvest-industrial-leads,
  // monitor-asset-telemetry — same category as missed-call-webhook)
  // deliberately don't read the flag, so the toggle is hidden for those
  // rows below.
  const KILL_SWITCH_GATED_FUNCTIONS = [
    'chase-unpaid-invoices', 'check-inventory-levels', 'check-weather-risk',
    'detect-wasted-trips', 'generate-growth-drafts', 'nurture-stale-leads',
    'retention-checkin', 'winback-lost-leads', 'agent-council-report',
    'reconcile-billing', 'update-technician-workload',
    'optimize-industrial-routes', 'track-consumables', 'detect-safety-hazards',
    'sequence-handoffs', 'verify-industrial-compliance',
  ]
  const agentGroupCounts = AGENT_GROUPS.map(agent => ({
    agent,
    count: agentFunctions.filter(f => f.agent === agent).length,
    notYetBuilt: NOT_YET_BUILT_AGENTS.includes(agent),
  }))
  const isUnhealthyFn = (fn) => fn.error_count >= 5 || fn.last_status === 'error'
  const unhealthyAgentFunctions = agentFunctions.filter(isUnhealthyFn)
  const sortedAgentFunctions = [...agentFunctions].sort((a, b) => {
    const au = isUnhealthyFn(a), bu = isUnhealthyFn(b)
    if (au !== bu) return au ? -1 : 1
    return (a.agent || '').localeCompare(b.agent || '') || a.name.localeCompare(b.name)
  })
  // First Agent Council report lands the next Monday after today (cron runs
  // weekly on Mondays — see supabase_schema_delta_agent_council_cron.sql).
  // If today IS Monday, shown date is next week's rather than today's, since
  // this label only renders when no report row exists yet at all.
  function nextMondayLabel() {
    const d = new Date()
    const day = d.getDay() // 0=Sun..6=Sat
    const daysUntil = day === 1 ? 7 : (8 - day) % 7
    const next = new Date(d)
    next.setDate(d.getDate() + daysUntil)
    return next.toLocaleDateString('en-AU')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#050811', fontFamily: 'Arial, sans-serif' }}>

      {/* Left sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <p style={styles.bizLabel}>{business?.name || 'Loading...'}</p>
          <h2 style={styles.sidebarTitle}>Dispatch</h2>
          {businessId && (
            <button style={styles.copyLinkBtn} onClick={copyIntakeLink}>
              {linkCopied ? 'Copied!' : '🔗 Copy intake chat link'}
            </button>
          )}
          {business?.subscription_tier === 'pro' && (
            <button style={{ ...styles.copyLinkBtn, marginTop: 6 }} onClick={() => setShowChecklistModal(true)}>
              📋 {checklistTemplate ? 'Edit' : 'Set up'} completion checklist
            </button>
          )}
          {business?.subscription_tier === 'pro' && (
            <button style={{ ...styles.copyLinkBtn, marginTop: 6 }} onClick={() => setShowOnboardingModal(true)}>
              🧑‍🔧 {onboardingTemplate ? 'Edit' : 'Set up'} technician onboarding checklist
            </button>
          )}
          <button style={{ ...styles.copyLinkBtn, marginTop: 6 }} onClick={() => setShowSettingsModal(true)}>
            ⚙️ Settings
          </button>
        </div>

        {/* Technician list */}
        <div style={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={styles.sectionLabel}>TECHNICIANS ({technicians.length})</p>
            <button style={styles.addJobBtn} onClick={() => setShowAddTech(true)}>+ Add</button>
          </div>
          <p style={styles.billingNote} title="Billing is based on technicians who have opened their phone link and started tracking at least once, not just how many were added at signup.">
            {technicians.filter(t => t.last_seen).length} of {technicians.length} billed (phone connected)
          </p>
          {technicians.map((tech, i) => {
            const job = jobs.find(j => j.id === tech.current_job_id)
            return (
              <div key={tech.id}
                style={{ ...styles.techRow, borderLeft: `3px solid ${techColors[i % techColors.length]}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
                  onClick={() => {
                    setSelected(tech)
                    if (tech.current_lat) {
                      setViewState(prev => ({ ...prev, latitude: tech.current_lat, longitude: tech.current_lng, zoom: 14 }))
                    }
                  }}>
                  <div style={{ cursor: 'pointer', flex: 1 }}>
                    <p style={styles.techName}>{tech.name}</p>
                    <p style={styles.techMeta}>
                      {job ? `On job: ${job.client_name}` : 'Available'}
                    </p>
                    <p style={styles.techMeta}>Last seen: {timeAgo(tech.last_seen)}</p>
                    {tech.rolling_week_hours != null && tech.rolling_week_hours > 0 && (
                      <p style={{ ...styles.techMeta, color: tech.rolling_week_hours >= 55 ? '#A87C16' : '#666' }}
                        title="Estimated from GPS activity over the last 7 days — a signal, not a timesheet.">
                        {tech.rolling_week_hours >= 55 ? '⚠️ ' : ''}{tech.rolling_week_hours}h this wk
                      </p>
                    )}
                  </div>
                  <button style={styles.techRemoveBtn} title="Remove technician"
                    onClick={(e) => { e.stopPropagation(); deactivateTech(tech.id) }}>✕</button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Job queue / Leads tabs — grouped under the named agent departments
            handling each area (purely a labeling/grouping layer over the
            existing tabs, same data and functions as before). */}
        <div style={styles.section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={styles.deptLabel}>Front Desk</span>
              <button style={styles.tabBtn(queueTab === 'leads')} onClick={() => setQueueTab('leads')}>
                LEADS ({leads.length})
              </button>
              <button style={styles.tabBtn(queueTab === 'quotes')} onClick={() => setQueueTab('quotes')}>
                QUOTES ({quotes.length})
              </button>
              <span style={{ ...styles.deptLabel, marginLeft: 8 }}>Dispatch & Crew</span>
              <button style={styles.tabBtn(queueTab === 'jobs')} onClick={() => setQueueTab('jobs')}>
                JOBS ({jobs.length})
              </button>
              <button style={styles.tabBtn(queueTab === 'subcontractors')} onClick={() => setQueueTab('subcontractors')}>
                SUBCONTRACTORS ({subcontractors.length})
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 6 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {business?.subscription_tier === 'pro' && (
                <>
                  <span style={styles.deptLabel}>Ledger</span>
                  <button style={styles.tabBtn(queueTab === 'invoices')} onClick={() => setQueueTab('invoices')}>
                    INVOICES ({invoices.length})
                  </button>
                  <button style={styles.tabBtn(queueTab === 'marketing')} onClick={() => setQueueTab('marketing')}>
                    MARKETING ({marketingDrafts.filter(d => d.status === 'pending').length})
                  </button>
                  <button style={styles.tabBtn(queueTab === 'payroll')} onClick={() => setQueueTab('payroll')}>
                    PAYROLL
                  </button>
                  <button style={styles.tabBtn(queueTab === 'carbon')} onClick={() => setQueueTab('carbon')}>
                    CARBON EST.
                  </button>
                </>
              )}
              {business?.subscription_tier === 'pro' && (
                <>
                  <span style={{ ...styles.deptLabel, marginLeft: 8 }}>Watchtower</span>
                  <button style={styles.tabBtn(queueTab === 'assets')} onClick={() => setQueueTab('assets')}>
                    ASSETS ({assets.length})
                  </button>
                  <button style={styles.tabBtn(queueTab === 'inventory')} onClick={() => setQueueTab('inventory')}>
                    INVENTORY ({inventory.length})
                  </button>
                  <button style={styles.tabBtn(queueTab === 'credentials')} onClick={() => setQueueTab('credentials')}>
                    CREDENTIALS ({technicianCredentials.length})
                  </button>
                </>
              )}
              <button style={styles.tabBtn(queueTab === 'weather')} onClick={() => setQueueTab('weather')}>
                WEATHER ({weatherDrafts.filter(d => d.status === 'pending').length})
              </button>
              <span style={{ ...styles.deptLabel, marginLeft: 8 }}>Minerva Max</span>
              <button style={styles.tabBtn(queueTab === 'max')} onClick={() => setQueueTab('max')}>
                MAX{computeUpsellNudges().length > 0 ? ` (${computeUpsellNudges().length})` : ''}
              </button>
              {/* Platform-wide, operator-only — gated behind ?agents=1, see
                  showAgentsTab definition above for the full reasoning. Not
                  shown to regular business owners by default. */}
              {showAgentsTab && (
                <>
                  <span style={{ ...styles.deptLabel, marginLeft: 8 }}>Agent Ops (operator only)</span>
                  <button style={styles.tabBtn(queueTab === 'agents')} onClick={() => setQueueTab('agents')}>
                    AGENTS
                  </button>
                </>
              )}
            </div>
            {queueTab === 'quotes' && hasAddon(business, 'ai_quotes') && <button style={styles.addJobBtn} onClick={() => setShowAddQuote(true)}>+ New quote</button>}
            {queueTab === 'jobs' && <button style={styles.addJobBtn} onClick={() => setShowAddJob(true)}>+ Add</button>}
            {queueTab === 'subcontractors' && hasAddon(business, 'subcontractor_pool') && <button style={styles.addJobBtn} onClick={() => setShowAddSubcontractor(true)}>+ Add</button>}
            {queueTab === 'assets' && <button style={styles.addJobBtn} onClick={() => setShowAddAsset(true)}>+ Add</button>}
            {queueTab === 'inventory' && <button style={styles.addJobBtn} onClick={() => setShowAddInventory(true)}>+ Add</button>}
            {queueTab === 'credentials' && <button style={styles.addJobBtn} onClick={() => setShowAddCredential(true)}>+ Add</button>}
          </div>

          {queueTab === 'quotes' && !hasAddon(business, 'ai_quotes') && addonLockCard('ai_quotes')}
          {queueTab === 'quotes' && hasAddon(business, 'ai_quotes') && (
            <>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
                Drafted with AI where possible (falls back to a blank editable line item if AI is
                unavailable) — nothing is sent to the client until you click Send.
              </p>
              {quotes.map(q => (
                <div key={q.id} style={styles.jobRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={styles.jobClient}>{q.client_name || 'Client'}</p>
                    <span style={styles.assetStatusBadge(q.status === 'accepted' ? 'available' : q.status === 'declined' ? 'maintenance' : 'in_use')}>
                      {q.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={styles.jobAddr}>{q.description}</p>
                  <p style={styles.jobAddr}>${Number(q.total || 0).toFixed(2)} inc. GST{q.ai_drafted ? ' · AI-drafted' : ''}</p>
                  {q.status === 'draft' && q.client_phone && (
                    <button style={styles.leadActionPrimary} disabled={sendingQuoteId === q.id} onClick={() => sendQuoteToClient(q.id)}>
                      {sendingQuoteId === q.id ? 'Sending...' : 'Send to client'}
                    </button>
                  )}
                  {q.status === 'draft' && !q.client_phone && (
                    <p style={{ ...styles.jobAddr, color: '#c47a3d' }}>No client phone on file — add one to send</p>
                  )}
                </div>
              ))}
              {quotes.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No quotes yet</p>}
            </>
          )}

          {queueTab === 'jobs' && (
            <>
              {hasAddon(business, 'demand_forecast') && demandForecast && (
                <p style={{ color: '#5B8DEF', fontSize: 11, margin: '0 0 10px' }}>
                  📈 {demandForecast.summary}
                </p>
              )}
              {wastedTripsCount > 0 && (
                <p style={{ color: '#A87C16', fontSize: 11, margin: '0 0 10px' }}>
                  🚚 Wasted trips this month: {wastedTripsCount} — GPS-confirmed on-site, job never started
                </p>
              )}
              {jobs.length > 0 && (
                <button style={{ ...styles.addJobBtn, marginBottom: 10 }} onClick={exportJobsCSV}>⬇ Export CSV</button>
              )}
              {jobs.map(job => (
                <div key={job.id} style={styles.jobRow}>
                  <p style={styles.jobClient}>{job.client_name}</p>
                  <p style={styles.jobAddr}>{job.client_address}</p>
                  <p style={styles.jobStatus(job.status)}>{job.status.toUpperCase()}</p>
                  {job.status === 'scheduled' && !job.technician_id && !job.assigned_subcontractor_id && (
                    <select style={styles.assignSelect}
                      onChange={(e) => e.target.value && assignJob(job.id, e.target.value)}>
                      <option value="">Assign tech...</option>
                      {technicians.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                  {hasAddon(business, 'subcontractor_pool') && job.status === 'scheduled' && !job.technician_id && !job.assigned_subcontractor_id && subcontractors.length > 0 && (
                    <select style={{ ...styles.assignSelect, marginTop: 4 }}
                      onChange={(e) => e.target.value && assignJobSubcontractor(job.id, e.target.value)}>
                      <option value="">Assign subcontractor...</option>
                      {subcontractors.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                  {job.assigned_subcontractor_id && (
                    <p style={styles.jobAddr}>Subcontractor: {subcontractors.find(s => s.id === job.assigned_subcontractor_id)?.name || 'Unknown'}</p>
                  )}
                  {/* Multi-technician job splitting — the assigned tech above stays the
                      "lead" (jobs.technician_id, unchanged); crew members are extra
                      hands added via job_assignments, own current_job_id points at
                      this job too so TechnicianView shows it to them. */}
                  {job.technician_id && (jobCrew[job.id] || []).length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {(jobCrew[job.id] || []).map(a => (
                        <p key={a.id} style={{ ...styles.jobAddr, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          Crew: {a.technicians?.name || 'Unknown'}
                          {hasAddon(business, 'crew_splitting') && (
                            <button style={{ ...styles.leadActionSecondary, marginLeft: 8, padding: '2px 8px', fontSize: 11 }}
                              onClick={() => removeCrewMember(a.id, a.technician_id)}>✕ Remove</button>
                          )}
                        </p>
                      ))}
                    </div>
                  )}
                  {job.technician_id && !hasAddon(business, 'crew_splitting') && (
                    <button style={{ ...styles.leadActionSecondary, marginTop: 6, fontSize: 11, padding: '3px 8px' }}
                      onClick={() => setQueueTab('max')}>
                      + Add crew (Minerva Max add-on)
                    </button>
                  )}
                  {job.technician_id && hasAddon(business, 'crew_splitting') &&
                    technicians.filter(t => t.id !== job.technician_id && !(jobCrew[job.id] || []).some(a => a.technician_id === t.id)).length > 0 && (
                    <select style={{ ...styles.assignSelect, marginTop: 4 }}
                      onChange={(e) => { if (e.target.value) addCrewMember(job.id, e.target.value); e.target.value = '' }}>
                      <option value="">+ Add crew member...</option>
                      {technicians.filter(t => t.id !== job.technician_id && !(jobCrew[job.id] || []).some(a => a.technician_id === t.id)).map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                </div>
              ))}
              {jobs.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No active jobs</p>}

              {/* Recently completed jobs — checklist photo evidence + materials
                  used, for warranty/damage/"did they actually do it" disputes. */}
              {business?.subscription_tier === 'pro' && completedJobs.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <p style={styles.sectionLabel}>RECENTLY COMPLETED</p>
                  {completedJobs.map(job => (
                    <div key={job.id} style={styles.jobRow}>
                      <div style={{ cursor: 'pointer' }} onClick={() => toggleJobDetails(job.id)}>
                        <p style={styles.jobClient}>{job.client_name}</p>
                        <p style={styles.jobAddr}>{job.client_address}</p>
                        <p style={{ ...styles.jobAddr, color: '#1D9E75' }}>
                          Completed {job.completed_at ? new Date(job.completed_at).toLocaleDateString('en-AU') : ''}
                          {' · '}{expandedJobId === job.id ? 'Hide details ▲' : 'View details ▼'}
                        </p>
                      </div>
                      <a href={`/dispute/${job.id}`} target="_blank" rel="noreferrer"
                        style={{ ...styles.leadActionSecondary, display: 'inline-block', textDecoration: 'none', marginTop: 4, fontSize: 11 }}
                        onClick={(e) => e.stopPropagation()}>
                        📁 Dispute Pack
                      </a>
                      {expandedJobId === job.id && (
                        <div style={{ marginTop: 8, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
                          {(jobPhotos[job.id] || []).length > 0 ? (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                              {jobPhotos[job.id].map(photo => {
                                const url = supabase.storage.from('checklist-photos').getPublicUrl(photo.storage_path).data.publicUrl
                                const watchtowerTitle = photo.verification_status === 'unavailable'
                                  ? photo.checklist_item
                                  : `${photo.checklist_item}${photo.verification_notes ? ' — ' + photo.verification_notes : ''}`
                                return (
                                  <a key={photo.id} href={url} target="_blank" rel="noreferrer" title={watchtowerTitle}
                                    style={{ position: 'relative', display: 'inline-block' }}>
                                    <img src={url} alt={photo.checklist_item} style={styles.photoThumb} />
                                    {(photo.verification_status === 'pass' || photo.verification_status === 'flagged') && (
                                      <span style={styles.watchtowerDot(photo.verification_status)} />
                                    )}
                                  </a>
                                )
                              })}
                            </div>
                          ) : (
                            <p style={{ color: '#444', fontSize: 11, margin: '0 0 8px' }}>No checklist photos attached</p>
                          )}
                          {(jobMaterials[job.id] || []).length > 0 ? (
                            (jobMaterials[job.id]).map(m => (
                              <p key={m.id} style={{ color: '#8899a6', fontSize: 12, margin: '0 0 2px' }}>
                                Used: {m.quantity_used}x {m.item_name}
                              </p>
                            ))
                          ) : (
                            <p style={{ color: '#444', fontSize: 11 }}>No materials recorded</p>
                          )}
                          <div style={{ marginTop: 10, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
                            <p style={{ color: '#555', fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', margin: '0 0 6px' }}>Incident Log</p>
                            {(jobIncidents[job.id] || []).length > 0 ? (
                              jobIncidents[job.id].map(inc => (
                                <p key={inc.id} style={{ color: '#8899a6', fontSize: 12, margin: '0 0 4px' }}>
                                  <span style={styles.incidentBadge(inc.category)}>{(inc.category || 'note').toUpperCase()}</span>
                                  {' '}{inc.description}
                                  <span style={{ color: '#444' }}> · {new Date(inc.created_at).toLocaleDateString('en-AU')}</span>
                                </p>
                              ))
                            ) : (
                              <p style={{ color: '#444', fontSize: 11, margin: '0 0 6px' }}>No incidents logged</p>
                            )}
                            <div style={{ display: 'flex', gap: 6, marginTop: 6 }} onClick={(e) => e.stopPropagation()}>
                              <select
                                value={incidentDraft.category}
                                onChange={e => setIncidentDraft(prev => ({ ...prev, category: e.target.value }))}
                                style={styles.incidentSelect}>
                                <option value="note">Note</option>
                                <option value="dispute">Dispute</option>
                                <option value="near_miss">Near miss</option>
                                <option value="commendation">Commendation</option>
                              </select>
                              <input
                                type="text"
                                placeholder="Add a note..."
                                value={incidentDraft.description}
                                onChange={e => setIncidentDraft(prev => ({ ...prev, description: e.target.value }))}
                                style={styles.incidentInput}
                              />
                              <button style={styles.leadActionSecondary} onClick={() => addIncident(job)}>Add</button>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {queueTab === 'subcontractors' && !hasAddon(business, 'subcontractor_pool') && addonLockCard('subcontractor_pool')}
          {queueTab === 'subcontractors' && hasAddon(business, 'subcontractor_pool') && (
            <>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
                External contractors dispatch can assign to a job alongside employed technicians —
                useful for overflow or specialised work. Doesn't affect employee payroll/FBT
                calculations, which stay employee-only.
              </p>
              {showAddSubcontractor && (
                <div style={{ ...styles.jobRow, marginBottom: 10 }}>
                  <input style={styles.input} placeholder="Name" value={newSubcontractor.name}
                    onChange={(e) => setNewSubcontractor(prev => ({ ...prev, name: e.target.value }))} />
                  <input style={{ ...styles.input, marginTop: 6 }} placeholder="Phone" value={newSubcontractor.phone}
                    onChange={(e) => setNewSubcontractor(prev => ({ ...prev, phone: e.target.value }))} />
                  <input style={{ ...styles.input, marginTop: 6 }} placeholder="Skills (comma-separated)" value={newSubcontractor.skills}
                    onChange={(e) => setNewSubcontractor(prev => ({ ...prev, skills: e.target.value }))} />
                  <input style={{ ...styles.input, marginTop: 6 }} type="number" placeholder="Hourly rate ($)" value={newSubcontractor.hourly_rate}
                    onChange={(e) => setNewSubcontractor(prev => ({ ...prev, hourly_rate: e.target.value }))} />
                  <button style={{ ...styles.leadActionPrimary, marginTop: 8 }} onClick={addSubcontractor}>Save</button>
                </div>
              )}
              {subcontractors.map(sub => (
                <div key={sub.id} style={styles.jobRow}>
                  <p style={styles.jobClient}>{sub.name}</p>
                  <p style={styles.jobAddr}>{sub.phone || 'No phone'}{sub.hourly_rate ? ` · $${sub.hourly_rate}/hr` : ''}</p>
                  {sub.skills?.length > 0 && <p style={styles.jobAddr}>{sub.skills.join(', ')}</p>}
                  <button style={styles.leadActionSecondary} onClick={() => removeSubcontractor(sub.id)}>Remove</button>
                </div>
              ))}
              {subcontractors.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No subcontractors added yet</p>}
            </>
          )}

          {queueTab === 'leads' && (
            <>
              {leads.length > 0 && (
                <button style={{ ...styles.addJobBtn, marginBottom: 10 }} onClick={exportLeadsCSV}>⬇ Export CSV</button>
              )}
              {leads.map(lead => (
                <div key={lead.id} style={styles.leadRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={styles.jobClient}>{lead.client_name || 'Unnamed'}</p>
                    <span style={styles.scoreBadge(lead.score)}>{lead.score ?? '–'}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, margin: '2px 0 4px' }}>
                    <span style={styles.urgencyBadge(lead.urgency)}>{(lead.urgency || 'routine').toUpperCase()}</span>
                    {lead.is_repeat_client && <span style={styles.repeatBadge}>RETURNING</span>}
                    {lead.estimated_value_tier && (
                      <span style={styles.repeatBadge}>{lead.estimated_value_tier.toUpperCase()} VALUE</span>
                    )}
                  </div>
                  <p style={styles.jobAddr}>{lead.suburb} · {lead.client_phone}</p>
                  <p style={styles.leadDesc}>{lead.job_description}</p>
                  {lead.score_reason && <p style={styles.leadReason}>{lead.score_reason}</p>}
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button style={styles.leadActionPrimary} onClick={() => convertLeadToJob(lead)}>Convert to job</button>
                    {lead.status === 'new' && (
                      <button style={styles.leadActionSecondary} onClick={() => markLeadStatus(lead.id, 'contacted')}>Contacted</button>
                    )}
                    <button style={styles.leadActionSecondary} onClick={() => markLeadStatus(lead.id, 'lost')}>Lost</button>
                  </div>
                </div>
              ))}
              {leads.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No open leads</p>}
            </>
          )}

          {queueTab === 'assets' && (
            <>
              {assets.map(asset => (
                <div key={asset.id} style={styles.jobRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={styles.jobClient}>{asset.name}</p>
                    <span style={styles.assetStatusBadge(asset.status)}>{(asset.status || 'available').replace('_', ' ').toUpperCase()}</span>
                  </div>
                  <p style={styles.jobAddr}>{asset.category}{asset.serial_number ? ` · ${asset.serial_number}` : ''}</p>
                  <select style={styles.assignSelect} value={asset.assigned_technician_id || ''}
                    onChange={(e) => assignAsset(asset.id, e.target.value)}>
                    <option value="">Unassigned</option>
                    {technicians.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <div style={{ marginTop: 6 }}>
                    {asset.status !== 'maintenance' ? (
                      <button style={styles.leadActionSecondary} onClick={() => setAssetStatus(asset.id, 'maintenance')}>Send to maintenance</button>
                    ) : (
                      <button style={styles.leadActionSecondary} onClick={() => setAssetStatus(asset.id, 'available')}>Mark available</button>
                    )}
                  </div>
                </div>
              ))}
              {assets.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No assets tracked yet</p>}
            </>
          )}

          {queueTab === 'carbon' && !hasAddon(business, 'carbon_estimate') && addonLockCard('carbon_estimate')}
          {queueTab === 'carbon' && hasAddon(business, 'carbon_estimate') && (
            <>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
                Estimate only — technician transit distance × a static reference vehicle-emissions
                factor. Straight-line distance, not real road routing, and no materials/embodied-carbon
                component. Confirm the factor is current before attaching this to a tender — see the
                CSV's "Factor Basis" column.
              </p>
              {carbonEstimates.length > 0 && (
                <button style={{ ...styles.addJobBtn, marginBottom: 10 }} onClick={exportCarbonCSV}>
                  ⬇ Export CSV
                </button>
              )}
              {carbonEstimates.length > 0 && (
                <p style={{ color: '#ccc', fontSize: 13, marginBottom: 10 }}>
                  Total estimated: {carbonEstimates.reduce((s, c) => s + Number(c.estimated_kg_co2e || 0), 0).toFixed(1)} kg CO2-e
                  {' '}across {carbonEstimates.reduce((s, c) => s + Number(c.distance_km || 0), 0).toFixed(0)} km (last {carbonEstimates.length} technician-day{carbonEstimates.length === 1 ? '' : 's'})
                </p>
              )}
              {carbonEstimates.map(c => (
                <div key={c.id} style={styles.jobRow}>
                  <p style={styles.jobClient}>{Number(c.estimated_kg_co2e).toFixed(1)} kg CO2-e</p>
                  <p style={styles.jobAddr}>{c.distance_km} km · {c.vehicle_type} · {new Date(c.created_at).toLocaleDateString('en-AU')}</p>
                </div>
              ))}
              {carbonEstimates.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No carbon estimates yet — generated daily once technicians have completed 2+ jobs in a day.</p>}
            </>
          )}

          {queueTab === 'invoices' && (
            <>
              {invoices.length > 0 && (
                <button style={{ ...styles.addJobBtn, marginBottom: 10 }} onClick={exportInvoicesCSV}>
                  ⬇ Export CSV
                </button>
              )}
              {invoices.map(inv => (
                <div key={inv.id} style={{ ...styles.jobRow, opacity: inv.status === 'void' ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={{ ...styles.jobClient, textDecoration: inv.status === 'void' ? 'line-through' : 'none' }}>{inv.client_name || 'Client'}</p>
                    <span style={styles.assetStatusBadge(inv.status === 'paid' ? 'available' : inv.status === 'void' ? 'maintenance' : 'maintenance')}>
                      {inv.status === 'paid' ? 'PAID' : inv.status === 'void' ? 'VOIDED' : 'UNPAID'}
                    </span>
                  </div>
                  <p style={styles.jobAddr}>${Number(inv.total).toFixed(2)} · {new Date(inv.created_at).toLocaleDateString('en-AU')}{inv.ai_verified ? ' · ✓ AI-verified' : ''}</p>
                  {inv.status === 'void' && (
                    <p style={{ ...styles.jobAddr, color: '#888' }}>
                      Voided {inv.voided_at ? new Date(inv.voided_at).toLocaleDateString('en-AU') : ''}{inv.voided_reason ? ` — "${inv.voided_reason}"` : ''}
                    </p>
                  )}
                  {inv.status !== 'paid' && inv.status !== 'void' && inv.reminder_count > 0 && (
                    <p style={{ ...styles.jobAddr, color: inv.reminder_count >= 3 ? '#c47a3d' : '#888' }}>
                      {inv.reminder_count} reminder{inv.reminder_count === 1 ? '' : 's'} sent automatically
                    </p>
                  )}
                  {inv.client_sms_failed && inv.status !== 'void' && (
                    <p style={{ ...styles.jobAddr, color: '#8A2525' }}>
                      ⚠️ Client was never texted this invoice — the send failed. Consider resending manually.
                    </p>
                  )}
                  {inv.status === 'unpaid' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button style={styles.leadActionPrimary} onClick={() => markInvoicePaid(inv.id)}>Mark paid</button>
                      <button style={styles.leadActionSecondary} onClick={() => voidInvoice(inv.id)}>Void</button>
                    </div>
                  )}
                  {inv.status !== 'void' && hasAddon(business, 'xero_sync') && business?.xero_connected && (
                    inv.xero_invoice_id
                      ? <p style={{ ...styles.jobAddr, color: '#1D9E75' }}>✓ Synced to Xero</p>
                      : <button style={styles.leadActionSecondary} onClick={() => syncInvoiceToXero(inv.id)}>Sync to Xero</button>
                  )}
                  {hasAddon(business, 'review_loop') && inv.status === 'paid' && business?.google_review_link && !reviewRequests[inv.id] && (
                    <button style={styles.leadActionSecondary} disabled={requestingReviewId === inv.id} onClick={() => requestReview(inv.id)}>
                      {requestingReviewId === inv.id ? 'Sending...' : '⭐ Request review'}
                    </button>
                  )}
                  {reviewRequests[inv.id]?.clicked_at && (
                    <p style={{ ...styles.jobAddr, color: '#1D9E75' }}>✓ Review link clicked</p>
                  )}
                  {reviewRequests[inv.id] && !reviewRequests[inv.id].clicked_at && (
                    <p style={{ ...styles.jobAddr, color: '#888' }}>Review request sent</p>
                  )}
                </div>
              ))}
              {invoices.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No invoices yet</p>}
            </>
          )}

          {queueTab === 'inventory' && (
            <>
              {inventory.map(item => {
                const low = (item.quantity ?? 0) <= (item.reorder_threshold ?? 0)
                return (
                  <div key={item.id} style={styles.jobRow}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <p style={styles.jobClient}>{item.name}</p>
                      {low && <span style={styles.assetStatusBadge('maintenance')}>LOW STOCK</span>}
                    </div>
                    <p style={styles.jobAddr}>
                      {item.supplier_name ? `Supplier: ${item.supplier_name} · ` : ''}Reorder at {item.reorder_threshold} {item.unit || 'units'}
                    </p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        defaultValue={item.quantity}
                        onBlur={(e) => updateInventoryQty(item.id, e.target.value)}
                        style={{ ...styles.input, width: 90, padding: '6px 8px' }}
                      />
                      <span style={{ fontSize: 13, color: '#888' }}>{item.unit || 'units'} on hand</span>
                    </div>
                  </div>
                )
              })}
              {inventory.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No inventory items tracked yet</p>}
            </>
          )}

          {queueTab === 'marketing' && (
            <>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
                Drafted automatically each week. Nothing is spent or sent until you approve it here.
              </p>
              {marketingDrafts.map(draft => (
                <div key={draft.id} style={styles.jobRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={styles.jobClient}>
                      {draft.type === 'ad_campaign' ? `📣 Ad — ${draft.headline || 'Untitled'}` : `💬 Win-back SMS`}
                    </p>
                    <span style={styles.assetStatusBadge(draft.status === 'pending' ? 'maintenance' : 'available')}>
                      {draft.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={styles.leadDesc}>{draft.body_text}</p>
                  {draft.type === 'ad_campaign' ? (
                    <p style={styles.jobAddr}>
                      {draft.target_suburb ? `${draft.target_suburb} · ${draft.target_radius_km}km radius · ` : ''}
                      ${draft.daily_budget}/day
                    </p>
                  ) : (
                    <p style={styles.jobAddr}>{(draft.recipients || []).length} recipient(s)</p>
                  )}
                  {draft.rationale && <p style={styles.leadReason}>{draft.rationale}</p>}
                  {draft.quality_notes && (
                    <p style={{ ...styles.leadReason, color: '#888' }}>✓ Reviewed: {draft.quality_notes}</p>
                  )}
                  {draft.status === 'failed' && draft.error && (
                    <p style={{ ...styles.leadReason, color: '#e05555' }}>Failed: {draft.error}</p>
                  )}
                  {draft.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        style={styles.leadActionPrimary}
                        disabled={marketingActionId === draft.id}
                        onClick={() => approveDraft(draft)}>
                        {marketingActionId === draft.id
                          ? 'Working…'
                          : draft.type === 'ad_campaign' ? 'Approve & Launch' : 'Approve & Send'}
                      </button>
                      <button
                        style={styles.leadActionSecondary}
                        disabled={marketingActionId === draft.id}
                        onClick={() => rejectDraft(draft.id)}>
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {marketingDrafts.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No marketing drafts yet — checked weekly</p>}
            </>
          )}

          {queueTab === 'payroll' && (
            <>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10, lineHeight: 1.4 }}>
                Estimated hours per technician, derived from GPS activity (same
                signal as the "this wk" hours shown on each technician card) —
                <strong> not a certified timesheet</strong>. Pick a period and
                generate, then export to hand to your accountant or import
                into your own payroll software. Minerva does not calculate
                PAYG, superannuation, or award rates.
              </p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#666', marginBottom: 4 }}>Period start</label>
                  <input type="date" value={payrollStart} max={payrollEnd}
                    onChange={e => setPayrollStart(e.target.value)} style={{ ...styles.input, padding: '6px 8px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, color: '#666', marginBottom: 4 }}>Period end</label>
                  <input type="date" value={payrollEnd} min={payrollStart} max={today}
                    onChange={e => setPayrollEnd(e.target.value)} style={{ ...styles.input, padding: '6px 8px' }} />
                </div>
                <button style={styles.addJobBtn} onClick={generatePayrollHours} disabled={payrollLoading}>
                  {payrollLoading ? 'Calculating…' : 'Generate'}
                </button>
                {payrollRows && (
                  <button style={{ ...styles.addJobBtn, background: 'transparent', border: '1px solid #1e293b', color: '#8fd0e8' }}
                    onClick={exportPayrollCSV}>
                    ⬇ Export CSV
                  </button>
                )}
              </div>
              {payrollRows && payrollRows.map(row => (
                <div key={row.id} style={styles.jobRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={styles.jobClient}>{row.name}</p>
                    <span style={{ fontSize: 13, fontWeight: 'bold', color: '#8fd0e8' }}>{row.hours}h</span>
                  </div>
                  <p style={styles.jobAddr}>{row.daysActive} day{row.daysActive === 1 ? '' : 's'} with GPS activity in period</p>
                </div>
              ))}
              {payrollRows && payrollRows.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No active technicians</p>}
              {!payrollRows && !payrollLoading && <p style={{ color: '#444', fontSize: 13 }}>Choose a period and click Generate</p>}
            </>
          )}

          {queueTab === 'credentials' && (
            <>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
                Licences, tickets, and certifications per technician. You'll get a Slack
                warning at 30, 14, and 7 days before expiry — plus an immediate one if an
                expiring credential belongs to a technician currently on a job.
              </p>
              {technicianCredentials.map(cred => {
                const daysLeft = Math.ceil((new Date(cred.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
                const color = daysLeft < 0 ? '#8A2525' : daysLeft <= 7 ? '#8A2525' : daysLeft <= 30 ? '#A87C16' : '#1D9E75'
                return (
                  <div key={cred.id} style={styles.jobRow}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <p style={styles.jobClient}>{cred.credential_name}</p>
                      <span style={{ fontSize: 10, fontWeight: 'bold', letterSpacing: 1, padding: '2px 6px', borderRadius: 6, color, background: color + '22' }}>
                        {daysLeft < 0 ? 'EXPIRED' : `${daysLeft}d LEFT`}
                      </span>
                    </div>
                    <p style={styles.jobAddr}>
                      {cred.technicians?.name || 'Unknown technician'}{cred.credential_type ? ` · ${cred.credential_type}` : ''}
                    </p>
                    <p style={styles.jobAddr}>Expires {cred.expiry_date}</p>
                    {cred.document_storage_path && (
                      <a href={supabase.storage.from('credential-documents').getPublicUrl(cred.document_storage_path).data.publicUrl}
                        target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#8fd0e8' }}>
                        View document
                      </a>
                    )}
                  </div>
                )
              })}
              {technicianCredentials.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No credentials tracked yet</p>}
            </>
          )}

          {queueTab === 'weather' && (
            <>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
                Checked daily for tomorrow's scheduled jobs at businesses with weather-sensitive
                trade types set in Settings. Nothing is sent to a client until you approve it here.
              </p>
              {weatherDrafts.map(draft => (
                <div key={draft.id} style={styles.jobRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={styles.jobClient}>{draft.jobs?.client_name || 'Job'}</p>
                    <span style={styles.assetStatusBadge(draft.status === 'pending' ? 'maintenance' : 'available')}>
                      {draft.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={styles.jobAddr}>{draft.jobs?.client_address}</p>
                  <p style={styles.leadDesc}>⛈️ {draft.forecast_summary}</p>
                  {draft.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button
                        style={styles.leadActionPrimary}
                        disabled={weatherActionId === draft.id}
                        onClick={() => approveWeatherDraft(draft)}>
                        {weatherActionId === draft.id ? 'Working…' : 'Approve & Send Reschedule SMS'}
                      </button>
                      <button
                        style={styles.leadActionSecondary}
                        disabled={weatherActionId === draft.id}
                        onClick={() => dismissWeatherDraft(draft.id)}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              ))}
              {weatherDrafts.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No weather-risk jobs flagged — set weather-sensitive trade types in Settings to enable this</p>}
            </>
          )}

          {/* Minerva Max add-on catalog + usage-triggered nudges. Every
              feature listed here already exists elsewhere in the app —
              this tab is the monetization surface, not new functionality.
              See src/maxAddons.js for the addon catalog + gating helpers. */}
          {queueTab === 'max' && (
            <>
              {computeUpsellNudges().length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ color: '#888', fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>BASED ON YOUR OWN ACTIVITY</p>
                  {computeUpsellNudges().map(nudge => {
                    const meta = MAX_ADDONS.find(a => a.key === nudge.key)
                    return (
                      <div key={nudge.key} style={{ ...styles.jobRow, background: '#1D2F4D22', border: '1px solid #2D5FA855' }}>
                        <p style={{ color: '#fff', fontSize: 13, margin: '0 0 8px', lineHeight: 1.4 }}>💡 {nudge.text}</p>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <button style={styles.leadActionPrimary} disabled={addonBusy === nudge.key}
                            onClick={() => enableMaxAddon(nudge.key)}>
                            {addonBusy === nudge.key ? 'Working…' : `Enable ${meta?.name} — $${meta?.price}/mo`}
                          </button>
                          {!hasUsedTrial(business, nudge.key) && (
                            <button style={styles.leadActionSecondary} disabled={addonBusy === nudge.key}
                              onClick={() => startMaxAddonTrial(nudge.key)}>
                              Try free for 30 days
                            </button>
                          )}
                          <button style={styles.leadActionSecondary} onClick={() => dismissNudge(nudge.key)}>Dismiss</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              <p style={{ color: '#888', fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>ALL ADD-ONS</p>
              <p style={{ color: '#666', fontSize: 12, marginBottom: 10, lineHeight: 1.4 }}>
                Enable individually as you need them, or trial any of them free for 30 days. Nothing here
                is billed automatically yet — enabling just turns the feature on.
              </p>
              {MAX_ADDONS.map(addon => {
                const enabled = business?.max_addons?.[addon.key] === true
                const trialing = isTrialing(business, addon.key)
                return (
                  <div key={addon.key} style={styles.jobRow}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <p style={styles.jobClient}>{addon.name}</p>
                      {enabled && !trialing && <span style={styles.assetStatusBadge('available')}>ENABLED</span>}
                      {trialing && <span style={styles.assetStatusBadge('in_use')}>TRIAL — {trialDaysLeft(business, addon.key)}d left</span>}
                    </div>
                    <p style={styles.leadDesc}>{addon.tagline}</p>
                    <p style={{ color: '#666', fontSize: 12, margin: '4px 0 8px' }}>{addon.description}</p>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {!enabled && (
                        <button style={styles.leadActionPrimary} disabled={addonBusy === addon.key}
                          onClick={() => enableMaxAddon(addon.key)}>
                          {addonBusy === addon.key ? 'Working…' : `Enable — $${addon.price}/mo`}
                        </button>
                      )}
                      {!enabled && !hasUsedTrial(business, addon.key) && (
                        <button style={styles.leadActionSecondary} disabled={addonBusy === addon.key}
                          onClick={() => startMaxAddonTrial(addon.key)}>
                          Try free for 30 days
                        </button>
                      )}
                      {enabled && (
                        <button style={styles.leadActionSecondary} disabled={addonBusy === addon.key}
                          onClick={() => disableMaxAddon(addon.key)}>
                          {addonBusy === addon.key ? 'Working…' : 'Disable'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* Agent Operating System dashboard (Phase 5). Platform-wide data —
              see showAgentsTab / the "Agent Ops (operator only)" tab button
              above for the gating decision and reasoning.
              Enable/disable toggle added 2026-09-02, extended 2026-09-05 to
              the industrial sector's pure cron sweeps: these autonomous
              cron-scheduled functions (Outreach/Finance/Marketing/
              Scheduling/Industrial reasoning agents — not the
              human-click-triggered ones like launch-ad-campaign, and not
              auto-assign-technician/industrial-conductor/
              enrich-industrial-leads since those have a direct-invocation
              mode with no safe mid-action fallback) now check
              agent_functions.enabled at the top of every run and skip with
              a 200 no-op if false. Event-driven and click-triggered
              functions don't show a toggle here since disabling them isn't
              meaningful the same way. */}
          {queueTab === 'agents' && (
            <>
              <p style={{ color: '#888', fontSize: 12, marginBottom: 10, lineHeight: 1.4 }}>
                Platform-wide health of Minerva's own Agent Operating System —
                every customer business's automation, not just this one.
                Visible here only because this link was opened with
                <code style={{ color: '#8fd0e8' }}> ?agents=1</code> (operator
                use; not shown to business owners by default).
              </p>

              {/* Summary strip */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                {agentGroupCounts.map(g => (
                  <div key={g.agent} style={styles.agentStatChip}>
                    <p style={styles.agentStatNum}>{g.count}</p>
                    <p style={styles.agentStatLabel}>{g.agent}{g.notYetBuilt ? ' — not yet built' : ''}</p>
                  </div>
                ))}
              </div>
              <p style={{ color: '#8899a6', fontSize: 12, margin: '0 0 16px' }}>
                <span style={{ color: unhealthyAgentFunctions.length > 0 ? '#8A2525' : '#1D9E75', fontWeight: 'bold' }}>
                  {unhealthyAgentFunctions.length} unhealthy
                </span>
                {' · '}{agentInsightsCount} insight{agentInsightsCount === 1 ? '' : 's'} in last 7 days
              </p>

              {/* Function health list — unhealthy first, then by agent name */}
              <p style={styles.sectionLabel}>FUNCTIONS ({agentFunctions.length})</p>
              {sortedAgentFunctions.map(fn => (
                <div key={fn.id} style={styles.jobRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={styles.jobClient}>{fn.name}</p>
                    <span style={styles.agentStatusBadge(fn.last_status)}>{(fn.last_status || 'unknown').toUpperCase()}</span>
                  </div>
                  <p style={styles.jobAddr}>
                    <span style={styles.agentBadge}>{fn.agent}</span>
                    {' · last run '}{timeAgo(fn.last_run_at)}
                    {fn.error_count > 0 ? ` · ${fn.error_count} error${fn.error_count === 1 ? '' : 's'}` : ''}
                  </p>
                  {KILL_SWITCH_GATED_FUNCTIONS.includes(fn.name) && (
                    <button
                      onClick={() => toggleAgentFunction(fn)}
                      style={{ ...styles.leadActionSecondary, marginTop: 8, padding: '4px 10px', fontSize: 11, color: fn.enabled === false ? '#1D9E75' : '#8A2525' }}>
                      {fn.enabled === false ? 'Enable' : 'Disable'}
                    </button>
                  )}
                </div>
              ))}
              {agentFunctions.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No agent functions recorded yet</p>}

              {/* Recent cross-agent insights feed */}
              <p style={{ ...styles.sectionLabel, marginTop: 16 }}>RECENT INSIGHTS (last 7 days)</p>
              {agentInsights.map(insight => (
                <div key={insight.id} style={styles.jobRow}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <span style={styles.agentBadge}>{insight.agent}</span>
                    <p style={{ color: '#555', fontSize: 11, margin: 0 }}>{timeAgo(insight.created_at)}</p>
                  </div>
                  <p style={{ ...styles.leadDesc, margin: '4px 0 2px' }}>{insight.summary}</p>
                  <p style={{ color: '#555', fontSize: 11, margin: 0, fontStyle: 'italic' }}>{insight.insight_type}</p>
                </div>
              ))}
              {agentInsights.length === 0 && <p style={{ color: '#444', fontSize: 13 }}>No insights in the last 7 days</p>}

              {/* Weekly Agent Council report — most recent row, if any */}
              <p style={{ ...styles.sectionLabel, marginTop: 16 }}>WEEKLY AGENT COUNCIL REPORT</p>
              {agentCouncilReport ? (
                <div style={styles.jobRow}>
                  <p style={styles.jobAddr}>
                    {new Date(agentCouncilReport.week_start).toLocaleDateString('en-AU')}
                    {' – '}
                    {new Date(agentCouncilReport.week_end).toLocaleDateString('en-AU')}
                  </p>
                  <p style={{ ...styles.leadDesc, whiteSpace: 'pre-wrap', margin: '6px 0' }}>{agentCouncilReport.summary}</p>
                  <p style={{ color: '#666', fontSize: 11, margin: 0 }}>
                    {agentCouncilReport.functions_checked} functions checked · {agentCouncilReport.insights_reviewed} insights reviewed · {agentCouncilReport.unhealthy_function_count} unhealthy
                  </p>
                </div>
              ) : (
                <p style={{ color: '#444', fontSize: 13 }}>No report yet — first one lands {nextMondayLabel()}</p>
              )}
            </>
          )}
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
          terrain={{ source: 'mapbox-dem', exaggeration: 1.5 }}
        >
          {/* 3D terrain elevation + sky atmosphere */}
          <Source
            id="mapbox-dem"
            type="raster-dem"
            url="mapbox://mapbox.mapbox-terrain-dem-v1"
            tileSize={512}
            maxzoom={14}
          />
          <Layer
            id="sky"
            type="sky"
            paint={{
              'sky-type': 'atmosphere',
              'sky-atmosphere-sun-intensity': 15
            }}
          />
          {/* 3D building extrusions — appear when zoomed in past street level */}
          <Layer
            id="3d-buildings"
            source="composite"
            source-layer="building"
            filter={['==', 'extrude', 'true']}
            type="fill-extrusion"
            minzoom={14}
            paint={{
              'fill-extrusion-color': '#1e3a5f',
              'fill-extrusion-height': ['get', 'height'],
              'fill-extrusion-base': ['get', 'min_height'],
              'fill-extrusion-opacity': 0.75
            }}
          />

          {/* Technician markers */}
          {technicians.map((tech, i) => tech.current_lat && (
            <Marker
              key={tech.id}
              latitude={tech.current_lat}
              longitude={tech.current_lng}
              anchor="center"
              onClick={(e) => { e.originalEvent.stopPropagation(); setSelected(tech); setShowTrail(false) }}
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
              onClose={() => { setSelected(null); setShowTrail(false) }}
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
                <button
                  onClick={() => setShowTrail(v => !v)}
                  style={{
                    marginTop: 8, fontSize: 12, padding: '4px 8px', cursor: 'pointer',
                    background: showTrail ? '#2D5FA8' : '#eee',
                    color: showTrail ? '#fff' : '#333',
                    border: 'none', borderRadius: 4
                  }}
                >
                  {showTrail ? 'Hide' : 'Show'} today's route{trailPoints.length > 0 ? ` (${trailPoints.length} pts)` : ''}
                </button>
              </div>
            </Popup>
          )}

          {/* Selected tech's GPS breadcrumb trail — a real, durable record of
              where they were today, not just the live dot. Cheap accountability/
              dispute evidence: "when were we actually on site" vs. current_lat/
              current_lng alone, which only ever holds the latest point. */}
          {showTrail && trailPoints.length > 1 && (
            <Source
              id="tech-trail"
              type="geojson"
              data={{
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: trailPoints.map(p => [p.lng, p.lat])
                }
              }}
            >
              <Layer
                id="tech-trail-line"
                type="line"
                paint={{ 'line-color': '#2D5FA8', 'line-width': 3, 'line-opacity': 0.85 }}
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              />
            </Source>
          )}
        </Map>
      </div>

      {/* New Quote Modal — quote-to-job AI estimator */}
      {showAddQuote && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={{ margin: '0 0 20px', color: '#1B2B4B', fontSize: 20 }}>New Quote</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.inputLabel}>Client name</label>
              <input type="text" style={styles.input} value={quoteDraft.client_name}
                onChange={e => setQuoteDraft(prev => ({ ...prev, client_name: e.target.value }))} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.inputLabel}>Client phone</label>
              <input type="text" style={styles.input} value={quoteDraft.client_phone}
                onChange={e => setQuoteDraft(prev => ({ ...prev, client_phone: e.target.value }))}
                placeholder="Needed to send the quote by SMS" />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={styles.inputLabel}>Job description</label>
              <textarea style={{ ...styles.input, minHeight: 80 }} value={quoteDraft.description}
                onChange={e => setQuoteDraft(prev => ({ ...prev, description: e.target.value }))}
                placeholder="e.g. Replace hot water system, 250L electric, single storey" />
              <p style={{ color: '#888', fontSize: 12, margin: '6px 0 0' }}>
                Line items are AI-drafted from this description and your recent invoice history
                where possible (falls back to one editable blank line if AI is unavailable) — you
                review and edit everything before it's ever sent to the client.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button type="button" style={{ ...styles.leadActionSecondary, flex: 1, padding: '10px 0' }} onClick={() => setShowAddQuote(false)} disabled={draftingQuote}>Cancel</button>
              <button type="button" style={{ ...styles.leadActionPrimary, flex: 2, padding: '10px 0' }} onClick={createQuote} disabled={draftingQuote || !quoteDraft.description.trim()}>
                {draftingQuote ? 'Drafting...' : 'Draft quote'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Job Modal */}
      {showAddJob && (
        <AddJobModal
          businessId={businessId}
          onClose={() => { setShowAddJob(false); loadAll() }}
        />
      )}

      {/* Add Technician Modal */}
      {showAddTech && (
        <AddTechnicianModal
          businessId={businessId}
          businessName={business?.name}
          onClose={() => { setShowAddTech(false); loadAll() }}
        />
      )}

      {/* Add Asset Modal */}
      {showAddAsset && (
        <AddAssetModal
          businessId={businessId}
          onClose={() => { setShowAddAsset(false); loadAll() }}
        />
      )}

      {/* Add Inventory Item Modal */}
      {showAddInventory && (
        <AddInventoryItemModal
          businessId={businessId}
          onClose={() => { setShowAddInventory(false); loadAll() }}
        />
      )}

      {/* Add Technician Credential Modal */}
      {showAddCredential && (
        <AddCredentialModal
          businessId={businessId}
          technicians={technicians}
          onClose={() => { setShowAddCredential(false); loadAll() }}
        />
      )}

      {/* Checklist Template Modal */}
      {showChecklistModal && (
        <ChecklistModal
          businessId={businessId}
          template={checklistTemplate}
          type="completion"
          onClose={() => { setShowChecklistModal(false); loadAll() }}
        />
      )}

      {/* Onboarding Checklist Template Modal */}
      {showOnboardingModal && (
        <ChecklistModal
          businessId={businessId}
          template={onboardingTemplate}
          type="onboarding"
          onClose={() => { setShowOnboardingModal(false); loadAll() }}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          business={business}
          slackWebhookInput={slackWebhookInput}
          setSlackWebhookInput={setSlackWebhookInput}
          googleReviewLinkInput={googleReviewLinkInput}
          setGoogleReviewLinkInput={setGoogleReviewLinkInput}
          metaAccessTokenInput={metaAccessTokenInput}
          setMetaAccessTokenInput={setMetaAccessTokenInput}
          metaAdAccountIdInput={metaAdAccountIdInput}
          setMetaAdAccountIdInput={setMetaAdAccountIdInput}
          metaPageIdInput={metaPageIdInput}
          setMetaPageIdInput={setMetaPageIdInput}
          weatherTradesInput={weatherTradesInput}
          setWeatherTradesInput={setWeatherTradesInput}
          saving={savingSettings}
          onSave={saveSettings}
          calendarLinkCopied={calendarLinkCopied}
          onCopyCalendarLink={copyCalendarLink}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  )
}

// ── ADD TECHNICIAN MODAL ───────────────────────────────────
// Lets the business owner grow their team after signup, not just at
// onboarding. Mirrors Onboarding.jsx's technician-creation step: generates
// a PIN, texts the setup link, and — since this technician will eventually
// open that link and start tracking — the new hire flows into billing
// automatically via sync-technician-billing once their phone connects.
function AddTechnicianModal({ businessId, businessName, onClose }) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const pin = generatePin()
      const { error: insertErr } = await supabase.from('technicians').insert({
        business_id: businessId, name: name.trim(), phone: phone.trim(), pin
      })
      if (insertErr) throw new Error(insertErr.message)

      const appUrl = import.meta.env.VITE_APP_URL
      await supabase.functions.invoke('send-setup-sms', {
        body: { phone: phone.trim(), name: name.trim(), businessName, techUrl: `${appUrl}/tech?pin=${pin}` }
      })
      onClose()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ margin: '0 0 20px', color: '#1B2B4B', fontSize: 20 }}>Add Technician</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Name</label>
            <input type="text" required value={name} onChange={e => setName(e.target.value)} style={styles.input} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Mobile (04xx...)</label>
            <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} style={styles.input} />
          </div>
          <p style={{ color: '#888', fontSize: 12, margin: '0 0 14px' }}>
            They'll be sent a setup text with their tracking link. Billing updates automatically once they open it.
          </p>
          {error && <p style={{ color: '#8A2525', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? 'Adding...' : 'Add & send setup text'}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ADD JOB MODAL ──────────────────────────────────────────
function AddJobModal({ businessId, onClose }) {
  const [form, setForm] = useState({
    client_name: '', client_phone: '', client_address: '', scheduled_time: '', notes: '', urgency: ''
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
        urgency: form.urgency || null,
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
          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Urgency (optional)</label>
            <select value={form.urgency} onChange={f('urgency')} style={styles.input}>
              <option value="">Routine (default)</option>
              <option value="emergency">Emergency</option>
              <option value="routine">Routine</option>
            </select>
            <p style={{ color: '#888', fontSize: 12, margin: '6px 0 0' }}>
              Marking a job emergency feeds the Fair-Rotation roster signal — it never
              blocks assignment, it just helps spread frequent emergency callouts more evenly.
            </p>
          </div>
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

// ── ADD ASSET MODAL ────────────────────────────────────────
// Pro-tier asset tracking: equipment, vehicles, or tools the business wants
// to keep tabs on and optionally assign to a technician.
function AddAssetModal({ businessId, onClose }) {
  const [form, setForm] = useState({ name: '', category: '', serial_number: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: insertErr } = await supabase.from('assets').insert({
      business_id: businessId,
      name: form.name.trim(),
      category: form.category.trim() || null,
      serial_number: form.serial_number.trim() || null,
      status: 'available'
    })
    if (insertErr) { setError(insertErr.message); setLoading(false); return }
    onClose()
  }

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ margin: '0 0 20px', color: '#1B2B4B', fontSize: 20 }}>Add Asset</h3>
        <form onSubmit={handleSubmit}>
          {[
            ['Name', 'name', true],
            ['Category (e.g. Vehicle, Tool, Equipment)', 'category', false],
            ['Serial number (optional)', 'serial_number', false],
          ].map(([label, field, required]) => (
            <div key={field} style={{ marginBottom: 14 }}>
              <label style={styles.inputLabel}>{label}</label>
              <input type="text" required={required} value={form[field]} onChange={f(field)} style={styles.input} />
            </div>
          ))}
          {error && <p style={{ color: '#8A2525', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? 'Adding...' : 'Add Asset'}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ADD INVENTORY ITEM MODAL ───────────────────────────────
function AddInventoryItemModal({ businessId, onClose }) {
  const [form, setForm] = useState({ name: '', quantity: '0', unit: 'units', reorder_threshold: '0', supplier_name: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: insertErr } = await supabase.from('inventory_items').insert({
      business_id: businessId,
      name: form.name.trim(),
      quantity: Number(form.quantity) || 0,
      unit: form.unit.trim() || 'units',
      reorder_threshold: Number(form.reorder_threshold) || 0,
      supplier_name: form.supplier_name.trim() || null
    })
    if (insertErr) { setError(insertErr.message); setLoading(false); return }
    onClose()
  }

  const f = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }))

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ margin: '0 0 20px', color: '#1B2B4B', fontSize: 20 }}>Add Inventory Item</h3>
        <form onSubmit={handleSubmit}>
          {[
            ['Name', 'name', 'text', true],
            ['Quantity on hand', 'quantity', 'number', true],
            ['Unit (e.g. units, boxes, metres)', 'unit', 'text', false],
            ['Reorder threshold', 'reorder_threshold', 'number', true],
            ['Usual supplier (optional)', 'supplier_name', 'text', false],
          ].map(([label, field, type, required]) => (
            <div key={field} style={{ marginBottom: 14 }}>
              <label style={styles.inputLabel}>{label}</label>
              <input type={type} required={required} value={form[field]} onChange={f(field)} style={styles.input} />
            </div>
          ))}
          {error && <p style={{ color: '#8A2525', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? 'Adding...' : 'Add Item'}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── ADD CREDENTIAL MODAL ───────────────────────────────────
// Pro-tier Licence/Ticket Expiry Guardian: records a technician's licence,
// ticket, or certification and its expiry date so check-credential-expiry
// can watch it and warn the dispatcher (30/14/7 days out, plus an urgent
// same-day nudge if the tech is on shift with an expired/near-expired
// credential). The document upload is optional — the expiry date is the
// only thing the agent actually needs; the photo/PDF is just handy proof
// to have on file alongside it.
function AddCredentialModal({ businessId, technicians, onClose }) {
  const [form, setForm] = useState({
    technician_id: technicians?.[0]?.id || '', credential_type: '', credential_name: '', expiry_date: ''
  })
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      let documentPath = null
      if (file) {
        const ext = file.name.split('.').pop()
        const path = `${businessId}/${form.technician_id}-${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('credential-documents')
          .upload(path, file)
        if (uploadErr) throw uploadErr
        documentPath = path
      }

      const { error: insertErr } = await supabase.from('technician_credentials').insert({
        business_id: businessId,
        technician_id: form.technician_id,
        credential_type: form.credential_type.trim() || null,
        credential_name: form.credential_name.trim(),
        expiry_date: form.expiry_date,
        document_storage_path: documentPath
      })
      if (insertErr) throw insertErr
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
        <h3 style={{ margin: '0 0 20px', color: '#1B2B4B', fontSize: 20 }}>Add Licence / Ticket</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Technician</label>
            <select required value={form.technician_id} onChange={f('technician_id')} style={styles.input}>
              {(technicians || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          {[
            ['Type (e.g. Licence, Ticket, Certification)', 'credential_type', 'text', false],
            ['Name (e.g. Electrical Licence, White Card, EWP Ticket)', 'credential_name', 'text', true],
            ['Expiry date', 'expiry_date', 'date', true],
          ].map(([label, field, type, required]) => (
            <div key={field} style={{ marginBottom: 14 }}>
              <label style={styles.inputLabel}>{label}</label>
              <input type={type} required={required} value={form[field]} onChange={f(field)} style={styles.input} />
            </div>
          ))}
          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Document photo/PDF (optional)</label>
            <input type="file" accept="image/*,application/pdf" onChange={e => setFile(e.target.files?.[0] || null)} style={styles.input} />
          </div>
          {error && <p style={{ color: '#8A2525', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" disabled={loading || !technicians?.length} style={styles.submitBtn}>
              {loading ? 'Saving...' : 'Add Credential'}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          </div>
          {!technicians?.length && <p style={{ color: '#A87C16', fontSize: 12, marginTop: 8 }}>Add a technician first before recording a credential for them.</p>}
        </form>
      </div>
    </div>
  )
}

// ── CHECKLIST TEMPLATE MODAL ───────────────────────────────
// Pro-tier compliance checklists. Two independent template types share this
// modal, distinguished by `type`: 'completion' (shown to technicians before
// they can complete a job) and 'onboarding' (shown once, before a
// technician's first "Start Tracking"). Upserts — updates the existing
// template row of that type if one exists, otherwise inserts a new one.
function ChecklistModal({ businessId, template, type = 'completion', onClose }) {
  const defaultName = type === 'onboarding' ? 'Onboarding Checklist' : 'Completion Checklist'
  const [name, setName] = useState(template?.name || defaultName)
  const [items, setItems] = useState(template?.items?.length ? template.items : [''])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function updateItem(i, value) {
    setItems(prev => prev.map((item, idx) => idx === i ? value : item))
  }

  function addItem() {
    setItems(prev => [...prev, ''])
  }

  function removeItem(i) {
    setItems(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const cleanItems = items.map(i => i.trim()).filter(Boolean)
    if (cleanItems.length === 0) { setError('Add at least one checklist item.'); return }
    setLoading(true)
    setError(null)
    try {
      if (template?.id) {
        const { error: updateErr } = await supabase.from('checklist_templates')
          .update({ name: name.trim() || defaultName, items: cleanItems })
          .eq('id', template.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase.from('checklist_templates').insert({
          business_id: businessId, name: name.trim() || defaultName, items: cleanItems, type
        })
        if (insertErr) throw insertErr
      }
      onClose()
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ margin: '0 0 20px', color: '#1B2B4B', fontSize: 20 }}>{defaultName}</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Checklist name</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} style={styles.input} />
          </div>
          <label style={styles.inputLabel}>
            {type === 'onboarding'
              ? 'Items (technician must tick all before their first "Start Tracking")'
              : 'Items (technician must tick all before completing a job)'}
          </label>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
              <input
                type="text"
                value={item}
                onChange={e => updateItem(i, e.target.value)}
                style={{ ...styles.input, flex: 1 }}
                placeholder={`Item ${i + 1}`}
              />
              {items.length > 1 && (
                <button type="button" onClick={() => removeItem(i)}
                  style={{ background: 'none', border: 'none', color: '#8A2525', fontSize: 16, cursor: 'pointer' }}>✕</button>
              )}
            </div>
          ))}
          <button type="button" onClick={addItem}
            style={{ background: 'none', border: '1px dashed #2D5FA8', color: '#2D5FA8', borderRadius: 8, padding: '8px 0', fontSize: 13, fontWeight: 'bold', cursor: 'pointer', width: '100%', marginBottom: 14 }}>
            + Add item
          </button>
          {error && <p style={{ color: '#8A2525', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" disabled={loading} style={styles.submitBtn}>
              {loading ? 'Saving...' : 'Save Checklist'}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── SETTINGS MODAL ─────────────────────────────────────────
// Slack webhook URL (for lead/dispatch/billing alerts), auto-dispatch
// toggle (auto-assign new jobs to the nearest connected technician), the
// read-only calendar subscription link (Google/Apple/Outlook "add calendar
// from URL"), and — Pro tier — this business's own Meta (Facebook/Instagram)
// Marketing API credentials for the Growth pillar's ad campaigns. All
// stored on the businesses row and consumed by the autonomous agents (see
// supabase_schema.sql + README.md). Meta credentials are this business's
// own, never a shared Minerva ad account.
function SettingsModal({
  business, slackWebhookInput, setSlackWebhookInput,
  googleReviewLinkInput, setGoogleReviewLinkInput,
  metaAccessTokenInput, setMetaAccessTokenInput,
  metaAdAccountIdInput, setMetaAdAccountIdInput,
  metaPageIdInput, setMetaPageIdInput,
  weatherTradesInput, setWeatherTradesInput,
  saving, onSave, calendarLinkCopied, onCopyCalendarLink, onClose,
}) {
  const [autoDispatch, setAutoDispatch] = useState(business?.auto_dispatch_enabled || false)

  async function handleSave(e) {
    e.preventDefault()
    await onSave({
      slackWebhookUrl: slackWebhookInput.trim(),
      autoDispatchEnabled: autoDispatch,
      metaAccessToken: metaAccessTokenInput.trim(),
      metaAdAccountId: metaAdAccountIdInput.trim(),
      metaPageId: metaPageIdInput.trim(),
      weatherSensitiveTradeTypes: weatherTradesInput.split(',').map(t => t.trim()).filter(Boolean),
      googleReviewLink: googleReviewLinkInput.trim(),
    })
    onClose()
  }

  return (
    <div style={styles.modalOverlay}>
      <div style={styles.modal}>
        <h3 style={{ margin: '0 0 20px', color: '#1B2B4B', fontSize: 20 }}>Settings</h3>
        <form onSubmit={handleSave}>
          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Slack webhook URL (optional)</label>
            <input
              type="text"
              value={slackWebhookInput}
              onChange={e => setSlackWebhookInput(e.target.value)}
              style={styles.input}
              placeholder="https://hooks.slack.com/services/..."
            />
            <p style={{ color: '#888', fontSize: 12, margin: '6px 0 0' }}>
              Get one from your Slack workspace: Settings &gt; Apps &gt; Incoming Webhooks.
              Used to post lead, dispatch, and billing alerts to your own channel. Treat it
              like a secret.
            </p>
          </div>

          <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <input
              type="checkbox"
              id="autoDispatch"
              checked={autoDispatch}
              onChange={e => setAutoDispatch(e.target.checked)}
            />
            <label htmlFor="autoDispatch" style={{ ...styles.inputLabel, margin: 0 }}>
              Auto-dispatch new jobs to the nearest available technician
            </label>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Xero</label>
            {!hasAddon(business, 'xero_sync') ? (
              <p style={{ color: '#888', fontSize: 12, margin: '4px 0 0' }}>
                🔒 Xero Sync is a Minerva Max add-on — enable it from the MAX tab first.
              </p>
            ) : business?.xero_connected ? (
              <p style={{ color: '#1D9E75', fontSize: 13, margin: '4px 0 0' }}>✓ Connected</p>
            ) : (
              <>
                <a
                  href={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/xero-oauth-connect?businessId=${business?.id}`}
                  style={{ ...styles.copyLinkBtn, padding: '8px 10px', display: 'inline-block', textDecoration: 'none' }}
                >
                  Connect Xero
                </a>
                <p style={{ color: '#888', fontSize: 12, margin: '6px 0 0' }}>
                  Requires the operator to have registered a free Xero developer app and set the
                  XERO_CLIENT_ID/XERO_CLIENT_SECRET secrets — until then this shows a setup message
                  instead of connecting. See xero-oauth-connect/index.ts for the two-step setup.
                </p>
              </>
            )}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Calendar feed (subscribe from Google/Apple/Outlook)</label>
            <button type="button" onClick={onCopyCalendarLink} style={{ ...styles.copyLinkBtn, padding: '8px 10px' }}>
              {calendarLinkCopied ? 'Copied!' : '🔗 Copy calendar subscription link'}
            </button>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Google review link (optional)</label>
            <input
              type="text"
              value={googleReviewLinkInput}
              onChange={e => setGoogleReviewLinkInput(e.target.value)}
              style={styles.input}
              placeholder="https://g.page/r/.../review"
            />
            <p style={{ color: '#888', fontSize: 12, margin: '6px 0 0' }}>
              Set this to enable "Request review" on paid invoices — texts the client a link that
              tracks the click, then redirects straight to this page.
            </p>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={styles.inputLabel}>Weather-sensitive trade types (comma-separated, optional)</label>
            <input
              type="text"
              value={weatherTradesInput}
              onChange={e => setWeatherTradesInput(e.target.value)}
              style={styles.input}
              placeholder="e.g. roofing, painting, concreting"
            />
            <p style={{ color: '#888', fontSize: 12, margin: '6px 0 0' }}>
              If what you do is weather-sensitive, list it here and tomorrow's scheduled jobs
              will be checked against the forecast each morning (Weather tab). Leave blank to
              turn this off entirely.
            </p>
          </div>

          {business?.subscription_tier === 'pro' && (
            <>
              <p style={{ ...styles.inputLabel, marginTop: 20, marginBottom: 10, color: '#1B2B4B' }}>
                Ad account (Growth pillar)
              </p>
              <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>
                Connects your own Meta (Facebook/Instagram) ad account so the weekly-drafted
                ad campaigns can be launched with your money, from your account — Minerva
                never holds or spends from a shared account. Leave blank to keep ad drafting
                on hold.
              </p>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.inputLabel}>Meta access token</label>
                <input
                  type="password"
                  value={metaAccessTokenInput}
                  onChange={e => setMetaAccessTokenInput(e.target.value)}
                  style={styles.input}
                  placeholder="Long-lived Marketing API access token"
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.inputLabel}>Meta ad account ID</label>
                <input
                  type="text"
                  value={metaAdAccountIdInput}
                  onChange={e => setMetaAdAccountIdInput(e.target.value)}
                  style={styles.input}
                  placeholder="act_1234567890"
                />
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={styles.inputLabel}>Facebook Page ID</label>
                <input
                  type="text"
                  value={metaPageIdInput}
                  onChange={e => setMetaPageIdInput(e.target.value)}
                  style={styles.input}
                  placeholder="The page ads will be published from"
                />
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="submit" disabled={saving} style={styles.submitBtn}>
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancel</button>
          </div>
        </form>

        {business?.id && <CustomWorkflowsPanel businessId={business.id} />}
      </div>
    </div>
  )
}

// Custom Workflows — the general-purpose "customized via chat" agent's
// config UI. "Configure via chat" today means: describe the rule in plain
// language to whoever's helping you set Minerva up, they fill in this
// small form for you (trigger/condition/action) — this panel manages its
// own save/delete directly against custom_workflows, independent of the
// main Settings form above since it's a separate table, not a businesses
// column. See run-custom-workflows edge function for execution logic.
function CustomWorkflowsPanel({ businessId }) {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [draft, setDraft] = useState({ name: '', trigger_event: 'lead.created', condition_field: '', condition_op: '', condition_value: '', action_type: 'slack', action_target: '' })
  // Audit log for run-custom-workflows — previously written to workflow_runs
  // by that function but never surfaced anywhere, so a failed webhook/Slack
  // action was invisible. Loaded lazily (only when expanded) since most
  // businesses will have few/no workflows to debug.
  const [showRunLog, setShowRunLog] = useState(false)
  const [runLog, setRunLog] = useState([])
  const [runLogLoading, setRunLogLoading] = useState(false)

  useEffect(() => {
    supabase.from('custom_workflows').select('*').eq('business_id', businessId).order('created_at', { ascending: false })
      .then(({ data }) => { setWorkflows(data || []); setLoading(false) })
  }, [businessId])

  function toggleRunLog() {
    const next = !showRunLog
    setShowRunLog(next)
    if (next && runLog.length === 0) {
      setRunLogLoading(true)
      supabase.from('workflow_runs').select('*').eq('business_id', businessId).order('created_at', { ascending: false }).limit(20)
        .then(({ data }) => { setRunLog(data || []); setRunLogLoading(false) })
    }
  }

  async function addWorkflow(e) {
    e.preventDefault()
    const row = { business_id: businessId, ...draft }
    if (!row.condition_field) { row.condition_field = null; row.condition_op = null; row.condition_value = null }
    const { data } = await supabase.from('custom_workflows').insert(row).select().single()
    if (data) setWorkflows(prev => [data, ...prev])
    setDraft({ name: '', trigger_event: 'lead.created', condition_field: '', condition_op: '', condition_value: '', action_type: 'slack', action_target: '' })
    setShowAdd(false)
  }

  async function toggleActive(wf) {
    await supabase.from('custom_workflows').update({ active: !wf.active }).eq('id', wf.id)
    setWorkflows(prev => prev.map(w => w.id === wf.id ? { ...w, active: !w.active } : w))
  }

  async function removeWorkflow(id) {
    await supabase.from('custom_workflows').delete().eq('id', id)
    setWorkflows(prev => prev.filter(w => w.id !== id))
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #eee' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h4 style={{ margin: 0, color: '#1B2B4B', fontSize: 15 }}>Custom Workflows</h4>
        <button type="button" onClick={() => setShowAdd(s => !s)} style={{ ...styles.cancelBtn, padding: '4px 10px', fontSize: 12 }}>
          {showAdd ? 'Cancel' : '+ Add rule'}
        </button>
      </div>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 10px' }}>
        Automate simple business logic — e.g. "when a job completes, notify a Zapier webhook" or "when an invoice is paid over $500, post to Slack".
      </p>

      {showAdd && (
        <form onSubmit={addWorkflow} style={{ background: '#f7f7f9', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <input required placeholder="Rule name" value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} style={{ ...styles.input, marginBottom: 8 }} />
          <select value={draft.trigger_event} onChange={e => setDraft(d => ({ ...d, trigger_event: e.target.value }))} style={{ ...styles.input, marginBottom: 8 }}>
            <option value="lead.created">When a new lead comes in</option>
            <option value="job.completed">When a job is completed</option>
            <option value="invoice.paid">When an invoice is paid</option>
          </select>
          <select value={draft.action_type} onChange={e => setDraft(d => ({ ...d, action_type: e.target.value }))} style={{ ...styles.input, marginBottom: 8 }}>
            <option value="slack">Post to Slack (uses your webhook above)</option>
            <option value="webhook">POST to a custom webhook URL</option>
          </select>
          {draft.action_type === 'webhook' && (
            <input required placeholder="https://your-webhook-url.com/..." value={draft.action_target} onChange={e => setDraft(d => ({ ...d, action_target: e.target.value }))} style={{ ...styles.input, marginBottom: 8 }} />
          )}
          <button type="submit" style={{ ...styles.submitBtn, padding: '6px 14px', fontSize: 13 }}>Save rule</button>
        </form>
      )}

      {!loading && workflows.length === 0 && <p style={{ color: '#aaa', fontSize: 12 }}>No custom workflows yet.</p>}
      {workflows.map(wf => (
        <div key={wf.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 'bold', color: wf.active ? '#1B2B4B' : '#bbb' }}>{wf.name}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#999' }}>{wf.trigger_event} → {wf.action_type}</p>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={() => toggleActive(wf)} style={{ ...styles.cancelBtn, padding: '3px 8px', fontSize: 11 }}>{wf.active ? 'Pause' : 'Resume'}</button>
            <button type="button" onClick={() => removeWorkflow(wf.id)} style={{ ...styles.cancelBtn, padding: '3px 8px', fontSize: 11 }}>Delete</button>
          </div>
        </div>
      ))}

      {workflows.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={toggleRunLog} style={{ ...styles.cancelBtn, padding: '4px 10px', fontSize: 11 }}>
            {showRunLog ? 'Hide run log' : 'Show recent run log'}
          </button>
          {showRunLog && (
            <div style={{ marginTop: 8 }}>
              {runLogLoading && <p style={{ color: '#aaa', fontSize: 12 }}>Loading...</p>}
              {!runLogLoading && runLog.length === 0 && <p style={{ color: '#aaa', fontSize: 12 }}>No runs recorded yet.</p>}
              {!runLogLoading && runLog.map(run => (
                <div key={run.id} style={{ padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                  <p style={{ margin: 0, fontSize: 11, color: run.status === 'error' ? '#8A2525' : '#1D9E75' }}>
                    {run.status === 'error' ? '✗' : '✓'} {run.trigger_event} → {run.action_type} · {new Date(run.created_at).toLocaleString('en-AU')}
                  </p>
                  {run.error_message && <p style={{ margin: 0, fontSize: 11, color: '#999' }}>{run.error_message}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const styles = {
  sidebar: { width: 280, background: '#0a0f1d', borderRight: '1px solid #1e293b', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  sidebarHeader: { padding: '20px 16px 12px', borderBottom: '1px solid #1e293b' },
  bizLabel: { color: '#555', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  sidebarTitle: { color: '#fff', fontSize: 22, margin: '0 0 10px', fontWeight: 'bold' },
  copyLinkBtn: { background: 'transparent', border: '1px solid #1e293b', color: '#8fd0e8', borderRadius: 8, padding: '5px 10px', fontSize: 11, cursor: 'pointer', width: '100%', textAlign: 'left' },
  section: { padding: '12px 16px', borderBottom: '1px solid #1e293b', overflowY: 'auto', maxHeight: '50vh' },
  sectionLabel: { color: '#555', fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 10px' },
  billingNote: { color: '#666', fontSize: 11, margin: '-4px 0 10px', cursor: 'default' },
  techRow: { padding: '10px 10px 10px 12px', background: '#050811', borderRadius: 10, marginBottom: 8, cursor: 'pointer' },
  techName: { color: '#fff', fontSize: 14, fontWeight: 'bold', margin: '0 0 3px' },
  techMeta: { color: '#666', fontSize: 12, margin: '0 0 2px' },
  techRemoveBtn: { background: 'none', border: 'none', color: '#444', fontSize: 13, cursor: 'pointer', padding: '2px 4px' },
  jobRow: { padding: '10px 12px', background: '#050811', borderRadius: 10, marginBottom: 8 },
  jobClient: { color: '#fff', fontSize: 14, fontWeight: 'bold', margin: '0 0 3px' },
  jobAddr: { color: '#666', fontSize: 12, margin: '0 0 4px' },
  jobStatus: (s) => ({ fontSize: 11, fontWeight: 'bold', margin: '0 0 6px', color: s === 'active' ? '#1D9E75' : '#A87C16' }),
  assignSelect: { width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #1e293b', background: '#0a0f1d', color: '#aaa', fontSize: 13, cursor: 'pointer' },
  addJobBtn: { background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
  tabBtn: (active) => ({ background: active ? '#2D5FA822' : 'transparent', color: active ? '#8fd0e8' : '#666', border: `1px solid ${active ? '#2D5FA8' : '#1e293b'}`, borderRadius: 8, padding: '3px 10px', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, cursor: 'pointer' }),
  deptLabel: { color: '#3a4a63', fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: 'bold' },
  leadRow: { padding: '10px 12px', background: '#050811', borderRadius: 10, marginBottom: 8 },
  leadDesc: { color: '#8899a6', fontSize: 12, margin: '0 0 4px', lineHeight: 1.4 },
  leadReason: { color: '#555', fontSize: 11, fontStyle: 'italic', margin: '0 0 2px' },
  scoreBadge: (score) => ({ fontSize: 12, fontWeight: 'bold', color: '#fff', background: score >= 70 ? '#8A2525' : score >= 40 ? '#A87C16' : '#2D5FA8', borderRadius: 12, padding: '1px 8px', minWidth: 20, textAlign: 'center' }),
  urgencyBadge: (urgency) => ({ fontSize: 10, fontWeight: 'bold', letterSpacing: 1, padding: '2px 6px', borderRadius: 6, color: urgency === 'emergency' ? '#fff' : '#1D9E75', background: urgency === 'emergency' ? '#8A2525' : '#1D9E7522' }),
  repeatBadge: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1, padding: '2px 6px', borderRadius: 6, color: '#534AB7', background: '#534AB722' },
  assetStatusBadge: (status) => ({ fontSize: 10, fontWeight: 'bold', letterSpacing: 1, padding: '2px 6px', borderRadius: 6, color: status === 'maintenance' ? '#A87C16' : status === 'in_use' ? '#2D5FA8' : '#1D9E75', background: status === 'maintenance' ? '#A87C1622' : status === 'in_use' ? '#2D5FA822' : '#1D9E7522' }),
  // Agent Operating System dashboard (Phase 5) — ok=green, error=red,
  // unknown/anything else=amber, same statusBadge color convention as
  // IndustrialDispatcherView.jsx.
  agentStatusBadge: (status) => ({ fontSize: 10, fontWeight: 'bold', letterSpacing: 1, padding: '2px 6px', borderRadius: 6, color: status === 'ok' ? '#1D9E75' : status === 'error' ? '#8A2525' : '#A87C16', background: status === 'ok' ? '#1D9E7522' : status === 'error' ? '#8A252522' : '#A87C1622' }),
  agentBadge: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase', color: '#8fd0e8' },
  agentStatChip: { background: '#050811', border: '1px solid #1e293b', borderRadius: 8, padding: '6px 10px', minWidth: 64 },
  agentStatNum: { color: '#fff', fontSize: 16, fontWeight: 'bold', margin: '0 0 2px' },
  agentStatLabel: { color: '#666', fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', margin: 0 },
  leadActionPrimary: { flex: 1, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 0', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' },
  leadActionSecondary: { background: 'transparent', color: '#888', border: '1px solid #1e293b', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' },
  marker: { width: 36, height: 36, borderRadius: '50%', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: 14, border: '2px solid #fff', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.5)' },
  jobMarker: { fontSize: 20, cursor: 'pointer' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 16, padding: 28, width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' },
  inputLabel: { display: 'block', fontSize: 13, fontWeight: 'bold', color: '#444', marginBottom: 5 },
  input: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  submitBtn: { flex: 1, background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, fontWeight: 'bold', cursor: 'pointer' },
  cancelBtn: { flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, cursor: 'pointer' },
  photoThumb: { width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: '1px solid #1e293b' },
  incidentBadge: (category) => ({
    display: 'inline-block',
    fontSize: 9,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    padding: '2px 6px',
    borderRadius: 4,
    color: '#fff',
    background: category === 'dispute' ? '#8A2525' : category === 'near_miss' ? '#a86a2d' : category === 'commendation' ? '#1D9E75' : '#2D5FA8'
  }),
  incidentSelect: { background: '#050811', color: '#ddd', border: '1px solid #1e293b', borderRadius: 6, fontSize: 11, padding: '5px 4px' },
  incidentInput: { flex: 1, background: '#050811', color: '#ddd', border: '1px solid #1e293b', borderRadius: 6, fontSize: 12, padding: '5px 8px' },
  watchtowerDot: (status) => ({
    position: 'absolute',
    top: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: status === 'flagged' ? '#8A2525' : '#1D9E75',
    border: '1.5px solid #050811'
  })
}
