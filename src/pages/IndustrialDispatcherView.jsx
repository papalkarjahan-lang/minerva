import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { timeAgo, describeAuditEntry, neutralizeFormula } from '../utils'
import LoadingScreen from '../components/LoadingScreen'
import ContactSupportModal from '../components/ContactSupportModal'
import { MAX_ADDONS, isTrialing, trialDaysLeft, hasUsedTrial, startTrialPatch } from '../maxAddons'
import { isTrialExpired, SIGNUP_TRIAL_DAYS } from '../businessAccess'

// Industrial sector console (Track B) — mirrors DispatcherView's structure
// and visual language, scoped to the industrial_* tables instead of the
// trade sector's jobs/technicians. List-based (no live map) since industrial
// work is multi-day/site-based rather than single-visit GPS tracking.
// URL: /industrial/:businessId

export default function IndustrialDispatcherView() {
  const { businessId } = useParams()
  const [business, setBusiness] = useState(null)
  const [leads, setLeads] = useState([])
  const [sites, setSites] = useState([])
  const [assets, setAssets] = useState([])
  const [consumables, setConsumables] = useState([])
  const [incidents, setIncidents] = useState([])
  const [correctiveActions, setCorrectiveActions] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [packages, setPackages] = useState([])
  const [fieldReports, setFieldReports] = useState([])
  const [copiedPackageId, setCopiedPackageId] = useState(null)
  const [tab, setTab] = useState('overview') // 'overview' | 'leads' | 'sites' | 'assets' | 'inventory' | 'safety' | 'verification'
  const [showAddLead, setShowAddLead] = useState(false)
  const [showAddSite, setShowAddSite] = useState(false)
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [showAddSchedule, setShowAddSchedule] = useState(false)
  const [maintenanceSchedules, setMaintenanceSchedules] = useState([])
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddIncident, setShowAddIncident] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [businessLoadError, setBusinessLoadError] = useState(null)
  // Billing-portal/support — DispatcherView has had both since early on;
  // this view never got either, so a business whose payment failed, or
  // who wants to cancel, or who just needs help, had the warning banners
  // above telling them to "update your card" / "contact us" with no
  // button anywhere that actually let them do either.
  const [showSupportModal, setShowSupportModal] = useState(false)
  const [billingPortalLoading, setBillingPortalLoading] = useState(false)
  const [billingPortalError, setBillingPortalError] = useState(null)
  // Notifications settings — notify-slack (the generic Slack alerter
  // behind industrial-conductor, detect-safety-hazards,
  // verify-industrial-compliance, monitor-asset-telemetry, and every other
  // autonomous agent on this side) reads businesses.slack_webhook_url and
  // silently no-ops when it's unset — "Slack is optional, everything else
  // works without it" per that function's own header comment. True for a
  // trade business, which can set it from DispatcherView's Settings modal
  // — but this view never had ANY way to set it at all, meaning every one
  // of those agents' Slack alerts has been permanently unreachable for
  // every industrial business, with no UI path that could ever fix that.
  const [showNotificationSettings, setShowNotificationSettings] = useState(false)
  const [slackWebhookInput, setSlackWebhookInput] = useState('')
  const [savingNotificationSettings, setSavingNotificationSettings] = useState(false)
  // Records (audit_log) — DispatcherView has had this a long time; this
  // view had no equivalent at all, so there was no "who added this lead/
  // site/asset" trail for a multi-person team sharing one dashboard login.
  // Same table, same RLS (owner-only), same lazy-load-on-first-open
  // pattern as DispatcherView's own Records tab.
  const [auditLog, setAuditLog] = useState([])
  const [auditLogLoaded, setAuditLogLoaded] = useState(false)
  // Shared across all 5 "Add ..." modals below (only one is ever open at a
  // time) — previously these forms had no in-flight state at all, so a
  // double-click or slow connection could fire the insert twice.
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [expandedAssetId, setExpandedAssetId] = useState(null)
  const [assetEvents, setAssetEvents] = useState({}) // asset_id -> asset_telemetry_events rows, fetched lazily
  const [expandedSiteId, setExpandedSiteId] = useState(null)
  const [siteCheckins, setSiteCheckins] = useState({}) // site_id -> site_checkins rows, fetched lazily
  const [ingestionKeyCopied, setIngestionKeyCopied] = useState(false)
  const [copiedBizCard, setCopiedBizCard] = useState(false)
  const [regeneratingKey, setRegeneratingKey] = useState(false)
  // Minerva Max add-on management (Asset Intelligence only, so far, is
  // relevant to Track B) — mirrors DispatcherView's addonBusy pattern.
  const [addonBusy, setAddonBusy] = useState(null)

  useEffect(() => { loadAll() }, [businessId])

  // Records tab lazy-load — same pattern as DispatcherView's own.
  useEffect(() => {
    if (tab === 'records' && !auditLogLoaded) {
      loadAuditLog()
    }
  }, [tab])

  async function loadAuditLog() {
    setAuditLogLoaded(true)
    const { data, error } = await supabase
      .from('audit_log')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) { console.error('audit_log fetch failed', error); return }
    setAuditLog(data || [])
  }

  // Fire-and-forget insert, same shape as DispatcherView's logAudit —
  // describeAuditEntry (utils.js) renders these rows back out, shared by
  // both consoles since the table/schema is identical either way.
  function logAudit(action, { entityType, entityId, details } = {}) {
    supabase.from('audit_log').insert({
      business_id: businessId,
      actor_type: 'owner',
      actor_name: business?.name || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      details: details || {},
    }).then(({ error }) => { if (error) console.error('audit log insert failed', error) })
    setAuditLog(prev => [{
      id: `optimistic-${Date.now()}`,
      business_id: businessId,
      actor_type: 'owner',
      actor_name: business?.name || null,
      action,
      entity_type: entityType || null,
      entity_id: entityId || null,
      details: details || {},
      created_at: new Date().toISOString(),
    }, ...prev])
  }

  async function loadAll() {
    const { data: biz, error: bizError } = await supabase.from('businesses').select('*').eq('id', businessId).single()
    if (bizError || !biz) {
      setBusinessLoadError(bizError?.message || 'Business not found')
      return
    }
    setBusiness(biz)
    setSlackWebhookInput(biz.slack_webhook_url || '')

    const { data: leadList } = await supabase.from('industrial_leads')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setLeads(leadList || [])

    const { data: siteList } = await supabase.from('site_projects')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setSites(siteList || [])

    const { data: assetList } = await supabase.from('industrial_assets')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setAssets(assetList || [])

    // Preventive maintenance schedules (added 2026-10-27) — see
    // supabase_schema_delta_maintenance_schedules.sql. Due work orders
    // raised from these show up as ordinary corrective_actions rows
    // (source_type='maintenance_schedule'), loaded below with the rest.
    const { data: scheduleList } = await supabase.from('maintenance_schedules')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setMaintenanceSchedules(scheduleList || [])

    const { data: itemList } = await supabase.from('consumables_items')
      .select('*').eq('business_id', businessId).order('name', { ascending: true })
    setConsumables(itemList || [])

    const { data: incidentList } = await supabase.from('safety_incidents')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setIncidents(incidentList || [])

    // Corrective-action tickets (added 2026-09-12) linked to safety_incidents
    // (and, on the trade-sector side, checklist_photos) by (source_type,
    // source_id) — see supabase_schema_delta_corrective_actions.sql. Loaded
    // once for the whole business since the safety tab needs to match each
    // incident to its ticket, not paginate them separately.
    const { data: actionList } = await supabase.from('corrective_actions')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setCorrectiveActions(actionList || [])

    const { data: techList } = await supabase.from('technicians')
      .select('id, name, current_site_id').eq('business_id', businessId).eq('is_active', true).order('name', { ascending: true })
    setTechnicians(techList || [])

    const { data: packageList } = await supabase.from('client_verification_packages')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setPackages(packageList || [])

    // Field reports (disputes/near-misses/notes a technician or dispatcher
    // logs on the spot) — the same `technician_incidents` table
    // DispatcherView surfaces per-job on the trade side. Industrial has no
    // job to scope by, so this loads the whole business's log at once,
    // same shape as safety_incidents above. Previously never read here at
    // all, so a real industrial technician's incident report (submitted
    // from TechnicianView.jsx, which already writes this table correctly)
    // was invisible to their own dispatcher — found 2026-10-10 while
    // tracing the technician-side site-tracking gap.
    const { data: fieldReportList } = await supabase.from('technician_incidents')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setFieldReports(fieldReportList || [])
  }

  // Lazy-loads an asset's recent telemetry events (geofence breaches +
  // maintenance-due flags — not routine 'ping' rows, those are too high-
  // volume to be a useful human-facing feed) only when its row is expanded.
  async function toggleAssetDetails(assetId) {
    if (expandedAssetId === assetId) { setExpandedAssetId(null); return }
    setExpandedAssetId(assetId)
    if (!assetEvents[assetId]) {
      const { data, error } = await supabase
        .from('asset_telemetry_events')
        .select('*')
        .eq('asset_id', assetId)
        .neq('event_type', 'ping')
        .order('created_at', { ascending: false })
        .limit(10)
      if (error) console.error('asset_telemetry_events fetch failed', error)
      setAssetEvents(prev => ({ ...prev, [assetId]: data || [] }))
    }
  }

  // Minerva Max add-on management — see src/maxAddons.js. Enable/disable go
  // through update-addon-billing, same as DispatcherView's identically-named
  // functions, which actually adds/removes a Stripe subscription item before
  // flipping the flag. startMaxAddonTrial stays a pure client-side write —
  // trials are a free, unbilled preview by design.
  async function enableMaxAddon(key) {
    setAddonBusy(key)
    try {
      const { data, error } = await supabase.functions.invoke('update-addon-billing', {
        body: { businessId, addonKey: key, action: 'enable' },
      })
      if (error || data?.error) throw new Error(data?.error || error.message)
      if (data?.business) setBusiness(data.business)
    } catch (err) {
      alert(`Couldn't enable add-on: ${err.message}`)
    } finally {
      setAddonBusy(null)
    }
  }

  async function startMaxAddonTrial(key) {
    setAddonBusy(key)
    const { data, error } = await supabase.from('businesses').update(startTrialPatch(business, key)).eq('id', businessId).select().single()
    if (error) { alert(`Couldn't start trial: ${error.message}`); setAddonBusy(null); return }
    if (data) setBusiness(data)
    setAddonBusy(null)
  }

  async function disableMaxAddon(key) {
    setAddonBusy(key)
    try {
      const { data, error } = await supabase.functions.invoke('update-addon-billing', {
        body: { businessId, addonKey: key, action: 'disable' },
      })
      if (error || data?.error) throw new Error(data?.error || error.message)
      if (data?.business) setBusiness(data.business)
    } catch (err) {
      alert(`Couldn't disable add-on: ${err.message}`)
    } finally {
      setAddonBusy(null)
    }
  }

  // Lazy-loads a site's check-in log (arrival/departure/task_start/
  // task_complete, from both human technicians and automated processes) —
  // previously written by detect-safety-hazards/sequence-handoffs/
  // package-client-verification but never actually shown anywhere in the
  // console. Only fetched when the row is expanded, same pattern as
  // toggleAssetDetails above.
  async function toggleSiteDetails(siteId) {
    if (expandedSiteId === siteId) { setExpandedSiteId(null); return }
    setExpandedSiteId(siteId)
    if (!siteCheckins[siteId]) {
      const { data, error } = await supabase
        .from('site_checkins')
        .select('*')
        .eq('site_id', siteId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) console.error('site_checkins fetch failed', error)
      setSiteCheckins(prev => ({ ...prev, [siteId]: data || [] }))
    }
  }

  // businesses.ingestion_key (see supabase_schema_delta_industrial.sql) is the
  // per-business shared secret that monitor-asset-telemetry/harvest-industrial-leads
  // require in the X-Ingestion-Key header before accepting any external data —
  // without a way to see the actual value here, this business's telemetry
  // hardware/integration vendor would have no way to ever obtain it.
  function copyIngestionKey() {
    if (!business?.ingestion_key) return
    navigator.clipboard.writeText(business.ingestion_key)
    setIngestionKeyCopied(true)
    setTimeout(() => setIngestionKeyCopied(false), 2000)
  }

  // Rotation path for the key above — previously had none at all, so a
  // leaked/compromised key (e.g. shared with the wrong telemetry vendor,
  // or visible in a support screenshot) could never be revoked short of a
  // direct DB edit. Generated client-side with crypto.randomUUID() (same
  // shape as the Postgres gen_random_uuid() default used at signup) and
  // written straight to businesses.ingestion_key — any hardware/webhook
  // still sending the old key starts failing immediately, by design.
  async function regenerateIngestionKey() {
    if (regeneratingKey) return
    if (!window.confirm('Generate a new ingestion key? Any telemetry hardware or webhook still using the old key will stop working until you update it with the new one.')) return
    setRegeneratingKey(true)
    const { data, error } = await supabase.from('businesses')
      .update({ ingestion_key: crypto.randomUUID() })
      .eq('id', businessId)
      .select()
      .single()
    if (error) alert(`Couldn't regenerate the key: ${error.message}`)
    if (data) { setBusiness(data); logAudit('ingestion_key.regenerated', { entityType: 'business', entityId: businessId }) }
    setRegeneratingKey(false)
  }

  // Mirrors DispatcherView's openBillingPortal exactly — see state comment
  // above for why this was missing here.
  async function openBillingPortal() {
    setBillingPortalLoading(true)
    setBillingPortalError(null)
    const { data, error } = await supabase.functions.invoke('create-billing-portal-session', { body: { businessId } })
    setBillingPortalLoading(false)
    if (error || !data?.portalUrl) { setBillingPortalError(data?.error || error?.message || 'Could not open billing portal.'); return }
    window.location.href = data.portalUrl
  }

  // Only the one field that's actually load-bearing for this sector right
  // now — see showNotificationSettings state comment above. Deliberately
  // not porting DispatcherView's whole multi-field SettingsModal (Meta ads
  // tokens, Google review link, weather-sensitive trade types, Twilio
  // number): those are read by trade-specific functions with no
  // industrial equivalent, so adding them here would be speculative UI
  // for settings nothing on this side would ever read.
  async function saveNotificationSettings() {
    if (savingNotificationSettings) return
    setSavingNotificationSettings(true)
    const { data, error } = await supabase.from('businesses')
      .update({ slack_webhook_url: slackWebhookInput.trim() || null })
      .eq('id', businessId)
      .select()
      .single()
    setSavingNotificationSettings(false)
    if (error) { alert(`Couldn't save: ${error.message}`); return }
    if (data) { setBusiness(data); logAudit('business.settings_updated', { entityType: 'business', entityId: businessId }) }
    setShowNotificationSettings(false)
  }

  async function addLead(e) {
    e.preventDefault()
    if (formSubmitting) return
    setFormSubmitting(true)
    const f = new FormData(e.target)
    const { data, error } = await supabase.from('industrial_leads').insert({
      business_id: businessId,
      company_name: f.get('company_name'),
      source: f.get('source') || 'manual',
      intent_signal: f.get('intent_signal'),
      equipment_need: f.get('equipment_need'),
      estimated_size: f.get('estimated_size'),
      status: 'new',
    }).select().single()
    setFormSubmitting(false)
    if (error) { alert(`Couldn't add lead: ${error.message}`); return }
    if (data) logAudit('lead.added', { entityType: 'industrial_lead', entityId: data.id, details: { company_name: data.company_name } })
    setShowAddLead(false)
    loadAll()
  }

  async function addSite(e) {
    e.preventDefault()
    if (formSubmitting) return
    setFormSubmitting(true)
    const f = new FormData(e.target)
    const { data, error } = await supabase.from('site_projects').insert({
      business_id: businessId,
      industrial_lead_id: f.get('industrial_lead_id') || null,
      name: f.get('name'),
      scope_of_work: f.get('scope_of_work'),
      status: 'active',
    }).select().single()
    setFormSubmitting(false)
    if (error) { alert(`Couldn't add site: ${error.message}`); return }
    if (data) logAudit('site.added', { entityType: 'site_project', entityId: data.id, details: { name: data.name } })
    setShowAddSite(false)
    loadAll()
  }

  async function addAsset(e) {
    e.preventDefault()
    if (formSubmitting) return
    setFormSubmitting(true)
    const f = new FormData(e.target)
    const { data, error } = await supabase.from('industrial_assets').insert({
      business_id: businessId,
      name: f.get('name'),
      asset_type: f.get('asset_type'),
      tag_id: f.get('tag_id') || null,
      // Schema enum is 'active' | 'maintenance' | 'idle' | 'out_of_service'
      // (see supabase_schema_delta_industrial.sql) — detect-idle-assets,
      // predict-asset-maintenance and optimize-industrial-routes all filter
      // industrial_assets on status='active'. This previously inserted
      // 'available' (not a value in that enum at all), so every asset
      // created here was silently invisible to all three cron jobs.
      status: 'active',
    }).select().single()
    setFormSubmitting(false)
    if (error) { alert(`Couldn't add asset: ${error.message}`); return }
    if (data) logAudit('asset.added', { entityType: 'industrial_asset', entityId: data.id, details: { name: data.name } })
    setShowAddAsset(false)
    loadAll()
  }

  async function addItem(e) {
    e.preventDefault()
    if (formSubmitting) return
    setFormSubmitting(true)
    const f = new FormData(e.target)
    const { data, error } = await supabase.from('consumables_items').insert({
      business_id: businessId,
      name: f.get('name'),
      unit: f.get('unit') || 'unit',
      quantity_on_hand: Number(f.get('quantity_on_hand')) || 0,
      reorder_threshold: Number(f.get('reorder_threshold')) || 0,
    }).select().single()
    setFormSubmitting(false)
    if (error) { alert(`Couldn't add item: ${error.message}`); return }
    if (data) logAudit('item.added', { entityType: 'consumables_item', entityId: data.id, details: { name: data.name } })
    setShowAddItem(false)
    loadAll()
  }

  async function runConductor(leadId) {
    // Guard added 2026-09-29: the disabled={busyId === l.id} attribute at
    // the call site alone doesn't close the window between two
    // synchronous clicks, and industrial-conductor's direct-invocation
    // {leadId} path has no server-side dedup of its own (only the
    // cron-sweep path is protected via conductor_suggested_at — see that
    // function's own header comment) — so a fast double-click here would
    // fire a real duplicate Slack suggestion for the same lead.
    if (busyId === leadId) return
    setBusyId(leadId)
    const { data, error } = await supabase.functions.invoke('industrial-conductor', { body: { leadId } })
    setBusyId(null)
    if (error || data?.error) alert(`Couldn't run Conductor: ${data?.error || error.message}`)
  }

  async function generatePackage(siteId) {
    // Same reasoning as runConductor above — package-client-verification
    // has no idempotency check before inserting a client_verification_
    // packages row and firing Slack, and there's no unique constraint on
    // site_id in the schema, so a double-click would create two duplicate
    // package rows and two duplicate client-facing notifications.
    if (busyId === siteId) return
    setBusyId(siteId)
    const { data, error } = await supabase.functions.invoke('package-client-verification', { body: { siteId } })
    setBusyId(null)
    if (error || data?.error) { alert(`Couldn't generate package: ${data?.error || error.message}`); return }
    loadAll()
  }

  async function acknowledgeIncident(id) {
    if (busyId === id) return
    setBusyId(id)
    const { error } = await supabase.from('safety_incidents').update({ acknowledged_at: new Date().toISOString() }).eq('id', id)
    setBusyId(null)
    if (error) { alert(`Couldn't acknowledge incident: ${error.message}`); return }
    loadAll()
  }

  // Assigns (or clears, when siteId is null) a technician's current site —
  // technicians.current_site_id, the industrial sibling of the trade
  // side's current_job_id (DispatcherView's assignJob). Unlike a job (one
  // primary technician, crew handled separately via job_assignments), this
  // points the other way: FROM the technician, so more than one tech can
  // already share the same current_site_id with nothing extra needed — a
  // natural fit for multi-day site work. See
  // supabase_schema_delta_technician_site_assignment.sql for the RLS this
  // depends on (the technician's own session needs SELECT on site_projects
  // and SELECT+INSERT on site_checkins to actually use this once assigned
  // — both added in that same delta, found missing by reading rls_scoping_
  // v3.sql's existing owner-only policy before writing any of this UI).
  async function assignTechnicianToSite(technicianId, siteId) {
    if (busyId === technicianId) return
    setBusyId(technicianId)
    const { error } = await supabase.from('technicians').update({ current_site_id: siteId }).eq('id', technicianId)
    setBusyId(null)
    if (error) { alert(`Couldn't update site assignment: ${error.message}`); return }
    // Found 2026-10-10 while checking today's own new actions against this
    // console's existing record-keeping convention: DispatcherView's own
    // assignJob() logs every assignment (and the Records tab exists
    // specifically to show this history back to the owner) — this action
    // was missing it entirely until now.
    const techName = technicians.find(t => t.id === technicianId)?.name || 'Unknown'
    const siteName = sites.find(s => s.id === siteId)?.name
    logAudit(siteId ? 'technician.site_assigned' : 'technician.site_unassigned', {
      entityType: 'technician', entityId: technicianId, details: { technician_name: techName, site_name: siteName },
    })
    loadAll()
  }

  // Dispatcher-side manual sign-off — the only writer of signed_off_at
  // anywhere in the codebase (confirmed by grep before adding this; the
  // column already existed with a badge reading it, but nothing ever set
  // it). Deliberately not a client self-service action — see
  // VerificationPackageView.jsx's own header comment for why — this
  // records that the operator personally obtained sign-off through
  // whatever real channel (in person, by email, verbally), same spirit as
  // the outreach "Record a reply or a win" tool.
  async function markPackageSignedOff(id) {
    if (busyId === id) return
    if (!confirm('Mark this verification package as signed off? Only do this once you’ve actually received the client’s sign-off.')) return
    setBusyId(id)
    const { error } = await supabase.from('client_verification_packages').update({ signed_off_at: new Date().toISOString() }).eq('id', id)
    setBusyId(null)
    if (error) { alert(`Couldn't mark signed off: ${error.message}`); return }
    // A signed-off package is a compliance/evidence record — exactly the
    // kind of action this console's audit log exists for, found missing
    // the same pass as assignTechnicianToSite's own fix above.
    const pkg = packages.find(p => p.id === id)
    const siteName = sites.find(s => s.id === pkg?.site_id)?.name
    logAudit('verification_package.signed_off', { entityType: 'client_verification_package', entityId: id, details: { site_name: siteName } })
    loadAll()
  }

  function copyPackageLink(id) {
    navigator.clipboard.writeText(`${window.location.origin}/verification/${id}`)
    setCopiedPackageId(id)
    setTimeout(() => setCopiedPackageId(null), 2000)
  }

  // Corrective-action ticket actions — see corrective_actions load in
  // loadAll(). All three are direct row updates (owner-scoped RLS, same
  // pattern as safety_incidents — both tightened from the original "anon
  // all" shape by rls_scoping_v3.sql), not a separate edge function,
  // matching how acknowledgeIncident/restockItem above already write
  // straight to their tables from this console. Each write is idempotent
  // (re-setting the same status/date/close timestamp causes no distinct
  // harm), but the busyId guard is added anyway for consistency with the rest of this
  // console's mutating handlers and to avoid redundant network calls.
  async function assignCorrectiveAction(id, technicianId) {
    if (busyId === id) return
    setBusyId(id)
    const { error } = await supabase.from('corrective_actions')
      .update({ assigned_to_technician_id: technicianId || null, status: technicianId ? 'in_progress' : 'open' })
      .eq('id', id)
    setBusyId(null)
    if (error) { alert(`Couldn't assign: ${error.message}`); return }
    loadAll()
  }

  async function setCorrectiveActionDueDate(id, dueDate) {
    if (busyId === id) return
    setBusyId(id)
    const { error } = await supabase.from('corrective_actions').update({ due_date: dueDate || null }).eq('id', id)
    setBusyId(null)
    if (error) { alert(`Couldn't set due date: ${error.message}`); return }
    loadAll()
  }

  async function closeCorrectiveAction(id) {
    if (busyId === id) return
    setBusyId(id)
    const ticket = correctiveActions.find(a => a.id === id)
    const { error } = await supabase.from('corrective_actions')
      .update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', id)
    if (error) { setBusyId(null); alert(`Couldn't close: ${error.message}`); return }

    // A maintenance-sourced ticket needs its schedule reset on close, or
    // sweep-maintenance-schedules would never raise the NEXT one — its
    // claim column (work_order_raised_at) only clears here, not on a timer.
    // Also records what the asset's engine hours actually were at service
    // time, which is what the next 'meter' due-check measures from.
    if (ticket?.source_type === 'maintenance_schedule') {
      const schedule = maintenanceSchedules.find(s => s.id === ticket.source_id)
      const asset = schedule ? assets.find(a => a.id === schedule.asset_id) : null
      await supabase.from('maintenance_schedules').update({
        last_completed_at: new Date().toISOString(),
        last_completed_hours: asset?.engine_hours ?? schedule?.last_completed_hours ?? null,
        work_order_raised_at: null,
      }).eq('id', ticket.source_id)
    }

    setBusyId(null)
    loadAll()
  }

  async function addSchedule(e) {
    e.preventDefault()
    if (formSubmitting) return
    setFormSubmitting(true)
    const f = new FormData(e.target)
    const triggerType = f.get('trigger_type')
    const { error } = await supabase.from('maintenance_schedules').insert({
      business_id: businessId,
      asset_id: f.get('asset_id'),
      title: f.get('title'),
      trigger_type: triggerType,
      interval_hours: triggerType === 'meter' ? Number(f.get('interval_hours')) || null : null,
      interval_days: triggerType === 'calendar' ? Number(f.get('interval_days')) || null : null,
      instructions: f.get('instructions') || null,
    })
    setFormSubmitting(false)
    if (error) { alert(`Couldn't add schedule: ${error.message}`); return }
    setShowAddSchedule(false)
    loadAll()
  }

  async function toggleScheduleActive(scheduleId, active) {
    if (busyId === scheduleId) return
    setBusyId(scheduleId)
    const { error } = await supabase.from('maintenance_schedules').update({ active }).eq('id', scheduleId)
    setBusyId(null)
    if (error) { alert(`Couldn't update schedule: ${error.message}`); return }
    loadAll()
  }

  // Previously there was no way to clear reorder_requested_at from the UI
  // at all — track-consumables sets it and the item just sits flagged
  // "LOW STOCK" forever, even after someone actually restocks it, since
  // clearing it is what re-arms the alert for next time (see
  // track-consumables' header comment).
  async function restockItem(id) {
    if (busyId === id) return
    setBusyId(id)
    const { error } = await supabase.from('consumables_items').update({ reorder_requested_at: null }).eq('id', id)
    setBusyId(null)
    if (error) { alert(`Couldn't mark item restocked: ${error.message}`); return }
    loadAll()
  }

  // Compliance/paperwork export — same zero-setup CSV pattern already used
  // in DispatcherView (see its exportCSV) for a compliance-relevant record
  // that regulators/insurers/auditors typically need in hand, not just
  // viewable in-app. Includes each incident's linked corrective-action
  // ticket status, since that's the actual remediation trail an auditor
  // cares about, not just the raw incident report.
  function exportIncidentsCSV() {
    const headers = ['Date', 'Severity', 'Description', 'Acknowledged At', 'Corrective Action Status', 'Corrective Action Due', 'Corrective Action Closed At']
    const rows = incidents.map(i => {
      const ticket = correctiveActions.find(a => a.source_type === 'safety_incident' && a.source_id === i.id)
      return [
        new Date(i.created_at).toLocaleString('en-AU'),
        i.severity,
        i.description,
        i.acknowledged_at ? new Date(i.acknowledged_at).toLocaleString('en-AU') : '',
        ticket?.status || '',
        ticket?.due_date || '',
        ticket?.closed_at ? new Date(ticket.closed_at).toLocaleString('en-AU') : '',
      ]
    })
    // neutralizeFormula (src/utils.js) guards against CSV/formula
    // injection (CWE-1236) — same fix as DispatcherView.jsx's
    // exportCSV, applied here too for consistency/defense-in-depth,
    // see that function's own comment for the full reasoning.
    const csv = [headers, ...rows]
      .map(row => row.map(field => `"${neutralizeFormula(field).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `minerva-safety-incidents-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Previously the only way a safety_incidents row was ever created was
  // via detect-safety-hazards' automated proximity check — a site manager
  // calling in an observed hazard had no way to log it except a direct DB
  // insert. This adds the missing manual-report path.
  async function addIncident(e) {
    e.preventDefault()
    if (formSubmitting) return
    setFormSubmitting(true)
    const f = new FormData(e.target)
    const { data, error } = await supabase.from('safety_incidents').insert({
      business_id: businessId,
      site_id: f.get('site_id') || null,
      severity: f.get('severity') || 'warning',
      description: f.get('description'),
    }).select().single()
    setFormSubmitting(false)
    if (error) { alert(`Couldn't log incident: ${error.message}`); return }
    if (data) logAudit('incident.reported', { entityType: 'safety_incident', entityId: data.id, details: { severity: data.severity } })
    setShowAddIncident(false)
    loadAll()
  }

  const openIncidents = incidents.filter(i => !i.acknowledged_at)
  // At-a-glance dashboard (OVERVIEW tab) — same approach as DispatcherView's
  // Overview tab: every figure comes from state already loaded by loadAll
  // for the other 6 tabs, so this adds zero new queries.
  const today = new Date().toISOString().slice(0, 10)
  const openCorrectiveActions = correctiveActions.filter(a => a.status !== 'closed')
  const overviewStats = {
    openIncidentCount: openIncidents.length,
    escalatedUnacked: openIncidents.filter(i => i.escalated_at).length,
    openActionCount: openCorrectiveActions.length,
    overdueActionCount: openCorrectiveActions.filter(a => a.due_date && a.due_date < today).length,
    activeSiteCount: sites.filter(s => s.status === 'active').length,
    assetsNeedingAttention: assets.filter(a => a.status === 'maintenance' || a.status === 'out_of_service').length,
    lowStockCount: consumables.filter(c => c.quantity_on_hand <= c.reorder_threshold).length,
    newLeadCount: leads.filter(l => l.status === 'new').length,
  }

  if (businessLoadError) {
    return (
      <div style={{ minHeight: '100vh', background: '#050811', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Arial, sans-serif', gap: 10, padding: 20, textAlign: 'center' }}>
        <p style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', margin: 0 }}>Could not load this dashboard</p>
        <p style={{ color: '#888', fontSize: 14, margin: 0, maxWidth: 420 }}>{businessLoadError}</p>
      </div>
    )
  }
  if (!business) return <LoadingScreen label="Loading your dashboard..." />

  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div>
          <p style={styles.bizLabel}>INDUSTRIAL SECTOR</p>
          <h1 style={styles.title}>{business?.name || '...'}</h1>
          {business?.subscription_tier === 'cancelled' && (
            <div style={styles.subscriptionCancelledBanner}>
              <p style={styles.subscriptionCancelledTitle}>⚠️ Subscription ended</p>
              <p style={styles.subscriptionCancelledLine}>
                Your Stripe subscription was cancelled — contact us to reactivate.
              </p>
            </div>
          )}
          {business?.subscription_tier !== 'cancelled' && business?.payment_failed_at && (
            <div style={styles.subscriptionCancelledBanner}>
              <p style={styles.subscriptionCancelledTitle}>⚠️ Payment failed</p>
              <p style={styles.subscriptionCancelledLine}>
                Your last card charge was declined. Stripe will keep retrying automatically —
                update your card to avoid a lapse.
              </p>
            </div>
          )}
          {isTrialExpired(business) && (
            <div style={styles.subscriptionCancelledBanner}>
              <p style={styles.subscriptionCancelledTitle}>⚠️ Free trial ended</p>
              <p style={styles.subscriptionCancelledLine}>
                Your {SIGNUP_TRIAL_DAYS}-day free trial has ended without an active subscription —
                contact us to subscribe.
              </p>
            </div>
          )}
          {business?.ingestion_key && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button type="button" onClick={copyIngestionKey} style={styles.smallBtn}>
                {ingestionKeyCopied ? 'Copied!' : '🔑 Copy telemetry ingestion key'}
              </button>
              <button type="button" disabled={regeneratingKey} onClick={regenerateIngestionKey} style={styles.smallBtn}>
                {regeneratingKey ? 'Regenerating…' : 'Regenerate'}
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <button type="button" disabled={billingPortalLoading} onClick={openBillingPortal} style={styles.smallBtn}>
              {billingPortalLoading ? 'Opening billing...' : '💳 Manage billing / Cancel'}
            </button>
            <button type="button" onClick={() => setShowSupportModal(true)} style={styles.smallBtn}>
              💬 Contact support
            </button>
            <button type="button" onClick={() => setShowNotificationSettings(true)} style={styles.smallBtn}>
              🔔 Notification settings
            </button>
            <button type="button"
              onClick={() => { navigator.clipboard.writeText(`${import.meta.env.VITE_APP_URL}/biz/${businessId}`); setCopiedBizCard(true); setTimeout(() => setCopiedBizCard(false), 2000) }}
              style={styles.smallBtn} title="A public page showing your real completed-jobs and team-size stats — link it from your own website or a tender submission.">
              {copiedBizCard ? 'Copied!' : '🔗 Copy my business card link'}
            </button>
          </div>
          {billingPortalError && <p style={{ color: '#e07a7a', fontSize: 11, margin: '0 0 12px' }}>{billingPortalError}</p>}
        </div>
        <div style={styles.tabRow}>
          {[
            ['overview', 'Overview', 0],
            ['leads', 'Signal & Enrich', leads.length],
            ['sites', 'Site Ops', sites.length],
            ['assets', 'Telemetry & Audit', assets.length],
            ['inventory', 'Quartermaster', consumables.length],
            ['safety', 'The Warden', openIncidents.length],
            ['verification', 'The Closer', packages.length],
            ['records', 'Records', 0],
          ].map(([id, label, count]) => (
            <button key={id} onClick={() => setTab(id)} style={styles.tabBtn(tab === id)}>
              {label} {count > 0 && <span style={styles.tabCount}>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.body}>
        {tab === 'overview' && (
          <div style={styles.overviewGrid}>
            <button style={styles.overviewCard} onClick={() => setTab('safety')}>
              <p style={styles.overviewCardValue(overviewStats.openIncidentCount > 0 ? '#8A2525' : '#fff')}>{overviewStats.openIncidentCount}</p>
              <p style={styles.overviewCardLabel}>Unacknowledged incidents</p>
              <p style={styles.overviewCardSub}>{overviewStats.escalatedUnacked > 0 ? `${overviewStats.escalatedUnacked} already escalated` : 'none escalated'}</p>
            </button>
            <button style={styles.overviewCard} onClick={() => setTab('safety')}>
              <p style={styles.overviewCardValue(overviewStats.overdueActionCount > 0 ? '#8A2525' : overviewStats.openActionCount > 0 ? '#A87C16' : '#fff')}>{overviewStats.openActionCount}</p>
              <p style={styles.overviewCardLabel}>Open corrective actions</p>
              <p style={styles.overviewCardSub}>{overviewStats.overdueActionCount} overdue</p>
            </button>
            <button style={styles.overviewCard} onClick={() => setTab('sites')}>
              <p style={styles.overviewCardValue('#2D5FA8')}>{overviewStats.activeSiteCount}</p>
              <p style={styles.overviewCardLabel}>Active sites</p>
              <p style={styles.overviewCardSub}>{sites.length} total</p>
            </button>
            <button style={styles.overviewCard} onClick={() => setTab('assets')}>
              <p style={styles.overviewCardValue(overviewStats.assetsNeedingAttention > 0 ? '#A87C16' : '#fff')}>{overviewStats.assetsNeedingAttention}</p>
              <p style={styles.overviewCardLabel}>Assets needing attention</p>
              <p style={styles.overviewCardSub}>in maintenance or out of service</p>
            </button>
            <button style={styles.overviewCard} onClick={() => setTab('inventory')}>
              <p style={styles.overviewCardValue(overviewStats.lowStockCount > 0 ? '#A87C16' : '#fff')}>{overviewStats.lowStockCount}</p>
              <p style={styles.overviewCardLabel}>Low-stock items</p>
              <p style={styles.overviewCardSub}>at or below reorder threshold</p>
            </button>
            <button style={styles.overviewCard} onClick={() => setTab('leads')}>
              <p style={styles.overviewCardValue(overviewStats.newLeadCount > 0 ? '#A87C16' : '#fff')}>{overviewStats.newLeadCount}</p>
              <p style={styles.overviewCardLabel}>New leads</p>
              <p style={styles.overviewCardSub}>not yet enriched or contacted</p>
            </button>
          </div>
        )}
        {tab === 'leads' && (
          <>
            <div style={styles.sectionHead}>
              <p style={styles.sectionLabel}>Industrial leads</p>
              <button style={styles.addBtn} onClick={() => setShowAddLead(true)}>+ Add lead</button>
            </div>
            {leads.length === 0 && <p style={styles.emptyText}>No leads yet. Leads also arrive automatically via the harvest-industrial-leads ingestion endpoint.</p>}
            {leads.map(l => (
              <div key={l.id} style={styles.row}>
                <p style={styles.rowTitle}>{l.company_name}</p>
                <p style={styles.rowMeta}>{l.equipment_need || 'No equipment need noted'} · {l.estimated_size || 'size unknown'} · source: {l.source}</p>
                {l.intent_signal && <p style={styles.rowDesc}>{l.intent_signal}</p>}
                <p style={styles.rowMeta}>
                  {l.decision_maker_name ? `Contact: ${l.decision_maker_name}${l.decision_maker_title ? ` (${l.decision_maker_title})` : ''}` : 'Not yet enriched with a decision-maker contact'}
                </p>
                {!l.decision_maker_name && l.enrichment_nudge_sent_at && (
                  <p style={{ ...styles.rowMeta, color: '#e07a7a' }}>
                    ⚠ Stuck at 'new' — Slack nudge sent {timeAgo(l.enrichment_nudge_sent_at)}
                  </p>
                )}
                <div style={styles.rowActions}>
                  <span style={styles.statusBadge(l.status)}>{l.status}</span>
                  <button style={styles.smallBtn} disabled={busyId === l.id} onClick={() => runConductor(l.id)}>
                    {busyId === l.id ? 'Running...' : 'Suggest asset (Conductor)'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'sites' && (
          <>
            <div style={styles.sectionHead}>
              <p style={styles.sectionLabel}>Site projects</p>
              <button style={styles.addBtn} onClick={() => setShowAddSite(true)}>+ Add site</button>
            </div>
            {sites.length === 0 && <p style={styles.emptyText}>No active sites yet.</p>}
            {sites.map(s => (
              <div key={s.id} style={styles.row}>
                <p style={styles.rowTitle}>{s.name}</p>
                <p style={styles.rowDesc}>{s.scope_of_work}</p>
                <div style={styles.rowActions}>
                  <span style={styles.statusBadge(s.status)}>{s.status}</span>
                  <button style={styles.smallBtn} disabled={busyId === s.id} onClick={() => generatePackage(s.id)}>
                    {busyId === s.id ? 'Packaging...' : 'Generate verification package'}
                  </button>
                  <button style={styles.smallBtn} onClick={() => toggleSiteDetails(s.id)}>
                    {expandedSiteId === s.id ? 'Hide check-ins ▲' : 'View check-ins ▼'}
                  </button>
                </div>
                {/* Technician assignment — sets technicians.current_site_id,
                    what TechnicianView.jsx reads to show this site and let
                    the assigned tech(s) check in/out. More than one
                    technician can be assigned to the same site at once
                    (see assignTechnicianToSite's own comment). */}
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                  {technicians.filter(t => t.current_site_id === s.id).map(t => (
                    <span key={t.id} style={styles.statusBadge('in_use')}>
                      {t.name}
                      <button
                        aria-label={`Remove ${t.name} from "${s.name}"`}
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', marginLeft: 6, padding: 0, font: 'inherit' }}
                        disabled={busyId === t.id}
                        onClick={() => assignTechnicianToSite(t.id, null)}
                      >✕</button>
                    </span>
                  ))}
                  {technicians.filter(t => t.current_site_id !== s.id).length > 0 && (
                    <select
                      aria-label={`Assign a technician to "${s.name}"`}
                      style={styles.smallSelect}
                      value=""
                      disabled={busyId != null}
                      onChange={e => { if (e.target.value) assignTechnicianToSite(e.target.value, s.id) }}
                    >
                      <option value="">+ Assign technician...</option>
                      {technicians.filter(t => t.current_site_id !== s.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  )}
                </div>
                {expandedSiteId === s.id && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
                    {(siteCheckins[s.id] || []).length > 0 ? (
                      siteCheckins[s.id].map(c => (
                        <p key={c.id} style={styles.rowMeta}>
                          <span style={styles.statusBadge(c.role === 'human_technician' ? 'available' : 'pending sign-off')}>
                            {c.role === 'human_technician' ? 'HUMAN' : 'AUTOMATED'}
                          </span>
                          {' '}{c.person_name || 'unknown'} — {(c.checkin_type || 'unknown').replace('_', ' ')}
                          {c.detail ? ` (${c.detail})` : ''}
                          <span style={{ color: '#888' }}> · {timeAgo(c.created_at)}</span>
                        </p>
                      ))
                    ) : (
                      <p style={styles.rowMeta}>No check-ins logged for this site yet.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'assets' && (
          <>
            <div style={styles.sectionHead}>
              <p style={styles.sectionLabel}>Assets</p>
              <button style={styles.addBtn} onClick={() => setShowAddAsset(true)}>+ Add asset</button>
            </div>
            {(() => {
              const meta = MAX_ADDONS.find(a => a.key === 'asset_intelligence')
              const enabled = business?.max_addons?.asset_intelligence === true
              const trialing = isTrialing(business, 'asset_intelligence')
              return (
                <div style={{ ...styles.row, marginBottom: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <p style={styles.rowTitle}>🔒 {meta.name} <span style={{ color: '#666', fontWeight: 'normal' }}>— Minerva Max add-on</span></p>
                    {enabled && !trialing && <span style={styles.statusBadge('available')}>ENABLED</span>}
                    {trialing && <span style={styles.statusBadge('in_use')}>TRIAL — {trialDaysLeft(business, 'asset_intelligence')}d left</span>}
                  </div>
                  <p style={styles.rowDesc}>{meta.description}</p>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
                    {!enabled && (
                      <button style={styles.addBtn} disabled={addonBusy === 'asset_intelligence'} onClick={() => enableMaxAddon('asset_intelligence')}>
                        {addonBusy === 'asset_intelligence' ? 'Working…' : `Enable — $${meta.price}/mo`}
                      </button>
                    )}
                    {!enabled && !hasUsedTrial(business, 'asset_intelligence') && (
                      <button style={styles.smallBtn} disabled={addonBusy === 'asset_intelligence'} onClick={() => startMaxAddonTrial('asset_intelligence')}>
                        Try free for 30 days
                      </button>
                    )}
                    {enabled && (
                      <button style={styles.smallBtn} disabled={addonBusy === 'asset_intelligence'} onClick={() => disableMaxAddon('asset_intelligence')}>
                        {addonBusy === 'asset_intelligence' ? 'Working…' : 'Disable'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}

            {(() => {
              const enabled = business?.max_addons?.asset_intelligence === true
              const trialing = isTrialing(business, 'asset_intelligence')
              if (!enabled && !trialing) return null
              const dueTickets = correctiveActions.filter(a => a.source_type === 'maintenance_schedule' && a.status !== 'closed')
              return (
                <>
                  <div style={{ ...styles.sectionHead, marginTop: 20 }}>
                    <p style={styles.sectionLabel}>Preventive maintenance</p>
                    <button style={styles.addBtn} onClick={() => setShowAddSchedule(true)} disabled={assets.length === 0}>+ Add schedule</button>
                  </div>
                  {assets.length === 0 && <p style={styles.emptyText}>Add an asset first to schedule maintenance against it.</p>}

                  {dueTickets.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <p style={{ ...styles.rowMeta, color: '#e07a7a', marginBottom: 6 }}>Due now — {dueTickets.length} work order{dueTickets.length === 1 ? '' : 's'}</p>
                      {dueTickets.map(t => (
                        <div key={t.id} style={styles.row}>
                          <p style={styles.rowTitle}>{t.title}</p>
                          <p style={styles.rowDesc}>{t.description}</p>
                          <div style={styles.rowActions}>
                            <span style={styles.statusBadge(t.status === 'in_progress' ? 'pending sign-off' : 'open')}>{t.status}</span>
                            {t.due_date && <span style={styles.rowMeta}>due {t.due_date}</span>}
                            <select
                              aria-label={`Assign "${t.title}" to`}
                              style={styles.smallSelect}
                              disabled={busyId === t.id}
                              defaultValue={t.assigned_to_technician_id || ''}
                              onChange={e => assignCorrectiveAction(t.id, e.target.value)}
                            >
                              <option value="">Unassigned</option>
                              {technicians.map(tech => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
                            </select>
                            <button style={styles.smallBtn} disabled={busyId === t.id} onClick={() => closeCorrectiveAction(t.id)}>Mark serviced</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {maintenanceSchedules.length === 0 ? (
                    <p style={styles.emptyText}>No preventive maintenance schedules yet.</p>
                  ) : (
                    maintenanceSchedules.map(s => {
                      const asset = assets.find(a => a.id === s.asset_id)
                      return (
                        <div key={s.id} style={styles.row}>
                          <p style={styles.rowTitle}>{s.title} <span style={{ color: '#666', fontWeight: 'normal' }}>— {asset?.name || 'unknown asset'}</span></p>
                          <p style={styles.rowMeta}>
                            {s.trigger_type === 'calendar'
                              ? `Every ${s.interval_days} days`
                              : `Every ${s.interval_hours} engine hours`}
                            {s.last_completed_at ? ` · last serviced ${timeAgo(s.last_completed_at)}` : ' · never serviced'}
                          </p>
                          <div style={styles.rowActions}>
                            <span style={styles.statusBadge(s.active ? 'available' : 'acknowledged')}>{s.active ? 'active' : 'paused'}</span>
                            <button style={styles.smallBtn} disabled={busyId === s.id} onClick={() => toggleScheduleActive(s.id, !s.active)}>
                              {s.active ? 'Pause' : 'Resume'}
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                </>
              )
            })()}

            {assets.length === 0 && <p style={styles.emptyText}>No assets registered yet.</p>}
            {assets.map(a => (
              <div key={a.id} style={styles.row}>
                <div style={{ cursor: 'pointer' }} onClick={() => toggleAssetDetails(a.id)}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleAssetDetails(a.id))}
                  role="button" tabIndex={0}>
                  <p style={styles.rowTitle}>{a.name}</p>
                  <p style={styles.rowMeta}>{a.asset_type} · {a.tag_id ? `tag ${a.tag_id}` : 'no tag id'} · {a.engine_hours || 0} engine hrs</p>
                  <p style={{ ...styles.rowMeta, color: a.last_telemetry_at ? '#666' : '#e07a7a' }}>
                    {a.last_telemetry_at ? `Last seen ${timeAgo(a.last_telemetry_at)}` : 'No telemetry received yet'}
                  </p>
                  <span style={styles.statusBadge(a.status)}>{a.status}</span>
                  <span style={{ ...styles.rowMeta, marginLeft: 8 }}>
                    {expandedAssetId === a.id ? 'Hide event history ▲' : 'View event history ▼'}
                  </span>
                </div>
                {expandedAssetId === a.id && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
                    {(assetEvents[a.id] || []).length > 0 ? (
                      assetEvents[a.id].map(ev => (
                        <p key={ev.id} style={styles.rowMeta}>
                          <span style={styles.statusBadge(ev.event_type === 'geofence_breach' ? 'open' : 'pending sign-off')}>
                            {ev.event_type.replace('_', ' ').toUpperCase()}
                          </span>
                          {' '}{ev.detail || ''}
                          <span style={{ color: '#888' }}> · {timeAgo(ev.created_at)}</span>
                        </p>
                      ))
                    ) : (
                      <p style={styles.rowMeta}>No breach or maintenance events recorded.</p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {tab === 'inventory' && (
          <>
            <div style={styles.sectionHead}>
              <p style={styles.sectionLabel}>Consumables</p>
              <button style={styles.addBtn} onClick={() => setShowAddItem(true)}>+ Add item</button>
            </div>
            {consumables.length === 0 && <p style={styles.emptyText}>No consumables tracked yet.</p>}
            {consumables.map(c => {
              const low = c.quantity_on_hand <= c.reorder_threshold
              return (
                <div key={c.id} style={styles.row}>
                  <p style={styles.rowTitle}>{c.name}</p>
                  <p style={{ ...styles.rowMeta, color: low ? '#e07a7a' : '#666' }}>
                    {c.quantity_on_hand} {c.unit} on hand (reorder below {c.reorder_threshold}){low ? ' — LOW STOCK' : ''}
                  </p>
                  {c.reorder_requested_at && (
                    <div style={styles.rowActions}>
                      <p style={styles.rowMeta}>Reorder flagged {timeAgo(c.reorder_requested_at)}</p>
                      <button style={styles.smallBtn} disabled={busyId === c.id} onClick={() => restockItem(c.id)}>Mark restocked</button>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {tab === 'safety' && (
          <>
            <div style={styles.sectionHead}>
              <p style={styles.sectionLabel}>Safety incidents</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {incidents.length > 0 && (
                  <button style={styles.smallBtn} onClick={exportIncidentsCSV}>Export CSV</button>
                )}
                <button style={styles.addBtn} onClick={() => setShowAddIncident(true)}>+ Report incident</button>
              </div>
            </div>
            {incidents.length === 0 && <p style={styles.emptyText}>No incidents recorded.</p>}
            {incidents.map(i => {
              const ticket = correctiveActions.find(a => a.source_type === 'safety_incident' && a.source_id === i.id)
              return (
                <div key={i.id} style={styles.row}>
                  <p style={styles.rowDesc}>{i.description}</p>
                  <p style={styles.rowMeta}>{i.severity} · {timeAgo(i.created_at)}</p>
                  <div style={styles.rowActions}>
                    <span style={styles.statusBadge(i.acknowledged_at ? 'acknowledged' : 'open')}>{i.acknowledged_at ? 'acknowledged' : 'open'}</span>
                    {!i.acknowledged_at && (
                      <button style={styles.smallBtn} disabled={busyId === i.id} onClick={() => acknowledgeIncident(i.id)}>Acknowledge</button>
                    )}
                  </div>
                  {/* verify-industrial-compliance auto-escalates an incident
                      left unacknowledged for 24h+ via a Slack alert only —
                      this row had no in-app trace of that having happened,
                      so a missed/muted Slack message meant no one would
                      ever know escalation had already fired. */}
                  {i.escalated_at && !i.acknowledged_at && (
                    <p style={{ ...styles.rowMeta, color: '#e07a7a' }}>
                      ⚠ Escalated {timeAgo(i.escalated_at)} — still unacknowledged
                    </p>
                  )}
                  {ticket && (
                    <div style={styles.correctiveActionBox}>
                      <p style={styles.rowMeta}>
                        Corrective action: <span style={styles.statusBadge(ticket.status === 'closed' ? 'acknowledged' : ticket.status === 'in_progress' ? 'pending sign-off' : 'open')}>{ticket.status}</span>
                        {ticket.due_date && ` · due ${ticket.due_date}`}
                        {ticket.closed_at && ` · closed ${timeAgo(ticket.closed_at)}`}
                      </p>
                      {ticket.status !== 'closed' && (
                        <div style={styles.rowActions}>
                          <select
                            aria-label={`Assign corrective action for "${i.description}" to`}
                            style={styles.smallSelect}
                            disabled={busyId === ticket.id}
                            defaultValue={ticket.assigned_to_technician_id || ''}
                            onChange={e => assignCorrectiveAction(ticket.id, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                          <input
                            aria-label={`Due date for corrective action on "${i.description}"`}
                            type="date"
                            style={styles.smallSelect}
                            disabled={busyId === ticket.id}
                            defaultValue={ticket.due_date || ''}
                            onChange={e => setCorrectiveActionDueDate(ticket.id, e.target.value)}
                          />
                          <button style={styles.smallBtn} disabled={busyId === ticket.id} onClick={() => closeCorrectiveAction(ticket.id)}>Close</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* Field reports — technician_incidents, the same dispute/near-
                miss/note log DispatcherView shows per-job on the trade
                side. A genuinely different table from safety_incidents
                above: this is a human-reported note (TechnicianView.jsx's
                "Report an issue"), not the Warden's own automated
                proximity detection. Never surfaced here before — a real
                industrial technician's field report was being written
                successfully but was invisible to their own dispatcher.
                Found and fixed 2026-10-10 alongside the technician
                site-tracking gap. */}
            <div style={{ ...styles.sectionHead, marginTop: 24 }}>
              <p style={styles.sectionLabel}>Field reports</p>
            </div>
            {fieldReports.length === 0 && <p style={styles.emptyText}>No field reports yet.</p>}
            {fieldReports.map(r => (
              <div key={r.id} style={styles.row}>
                <p style={styles.rowDesc}>{r.description}</p>
                <p style={styles.rowMeta}>
                  {(r.category || 'note').replace('_', ' ')}
                  {r.reported_by ? ` · reported by ${r.reported_by}` : ''}
                  {' · '}{timeAgo(r.created_at)}
                </p>
              </div>
            ))}
          </>
        )}

        {tab === 'verification' && (
          <>
            <p style={styles.sectionLabel}>Client verification packages</p>
            {packages.length === 0 && <p style={styles.emptyText}>None generated yet — use "Generate verification package" from the Site Ops tab.</p>}
            {packages.map(p => (
              <div key={p.id} style={styles.row}>
                <p style={styles.rowDesc}>{p.summary}</p>
                <div style={styles.rowActions}>
                  <span style={styles.statusBadge(p.signed_off_at ? 'signed off' : 'pending sign-off')}>{p.signed_off_at ? 'signed off' : 'pending sign-off'}</span>
                  <button style={styles.smallBtn} onClick={() => copyPackageLink(p.id)}>
                    {copiedPackageId === p.id ? 'Copied!' : 'Copy client link'}
                  </button>
                  {!p.signed_off_at && (
                    <button style={styles.smallBtn} disabled={busyId === p.id} onClick={() => markPackageSignedOff(p.id)}>Mark signed off</button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {tab === 'records' && (
          <>
            <p style={{ color: '#888', fontSize: 12, marginBottom: 10 }}>
              A record of key actions taken in this dashboard — leads, sites, assets, and
              inventory added, safety incidents reported, settings changes, and ingestion
              key rotations. Visible only to you (the account owner). Most recent 200 entries.
            </p>
            <p style={styles.sectionLabel}>Recorded actions</p>
            {auditLog.length === 0 && <p style={styles.emptyText}>No recorded actions yet</p>}
            {auditLog.map(entry => (
              <div key={entry.id} style={styles.row}>
                <p style={styles.rowDesc}>{describeAuditEntry(entry)}</p>
                <span style={{ color: '#888', fontSize: 11 }}>{new Date(entry.created_at).toLocaleString('en-AU')}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {showAddLead && (
        <div style={styles.modalOverlay} onClick={() => setShowAddLead(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addLead}>
            <p style={styles.modalTitle}>Add industrial lead</p>
            <input aria-label="Company name" name="company_name" placeholder="Company name" required style={styles.input} />
            <input aria-label="Equipment need" name="equipment_need" placeholder="Equipment need" style={styles.input} />
            <input aria-label="Estimated size" name="estimated_size" placeholder="Estimated size (e.g. 3 units, $50k)" style={styles.input} />
            <input aria-label="Intent signal / notes" name="intent_signal" placeholder="Intent signal / notes" style={styles.input} />
            <input aria-label="Source" name="source" placeholder="Source (default: manual)" style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddLead(false)}>Cancel</button>
              <button type="submit" disabled={formSubmitting} style={styles.submitBtn}>{formSubmitting ? 'Adding...' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}

      {showAddSite && (
        <div style={styles.modalOverlay} onClick={() => setShowAddSite(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addSite}>
            <p style={styles.modalTitle}>Add site project</p>
            <input aria-label="Site name" name="name" placeholder="Site name" required style={styles.input} />
            <input aria-label="Scope of work" name="scope_of_work" placeholder="Scope of work" style={styles.input} />
            <select aria-label="Linked lead" name="industrial_lead_id" style={styles.input}>
              <option value="">No linked lead</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.company_name}</option>)}
            </select>
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddSite(false)}>Cancel</button>
              <button type="submit" disabled={formSubmitting} style={styles.submitBtn}>{formSubmitting ? 'Adding...' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}

      {showAddAsset && (
        <div style={styles.modalOverlay} onClick={() => setShowAddAsset(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addAsset}>
            <p style={styles.modalTitle}>Add asset</p>
            <input aria-label="Asset name" name="name" placeholder="Asset name (e.g. Excavator 3)" required style={styles.input} />
            <input aria-label="Asset type" name="asset_type" placeholder="Asset type" style={styles.input} />
            <input aria-label="RFID / tracker tag ID" name="tag_id" placeholder="RFID / tracker tag ID (optional)" style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddAsset(false)}>Cancel</button>
              <button type="submit" disabled={formSubmitting} style={styles.submitBtn}>{formSubmitting ? 'Adding...' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}

      {showAddSchedule && (
        <div style={styles.modalOverlay} onClick={() => setShowAddSchedule(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addSchedule}>
            <p style={styles.modalTitle}>Add maintenance schedule</p>
            <select aria-label="Asset" name="asset_id" required style={styles.input} defaultValue="">
              <option value="" disabled>Select an asset</option>
              {assets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <input aria-label="Schedule title" name="title" placeholder="e.g. 250-hour service" required style={styles.input} />
            <select aria-label="Trigger type" name="trigger_type" style={styles.input} defaultValue="meter">
              <option value="meter">Every N engine hours</option>
              <option value="calendar">Every N days</option>
            </select>
            <input aria-label="Interval in engine hours" name="interval_hours" type="number" placeholder="Interval (engine hours) — if meter-based" style={styles.input} />
            <input aria-label="Interval in days" name="interval_days" type="number" placeholder="Interval (days) — if calendar-based" style={styles.input} />
            <input aria-label="Instructions (optional)" name="instructions" placeholder="Instructions (optional)" style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddSchedule(false)}>Cancel</button>
              <button type="submit" disabled={formSubmitting} style={styles.submitBtn}>{formSubmitting ? 'Adding...' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}

      {showAddIncident && (
        <div style={styles.modalOverlay} onClick={() => setShowAddIncident(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addIncident}>
            <p style={styles.modalTitle}>Report safety incident</p>
            <select aria-label="Site" name="site_id" style={styles.input}>
              <option value="">No specific site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select aria-label="Severity" name="severity" style={styles.input} defaultValue="warning">
              <option value="warning">Warning</option>
              <option value="hazard">Hazard</option>
            </select>
            <input aria-label="What happened?" name="description" placeholder="What happened?" required style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddIncident(false)}>Cancel</button>
              <button type="submit" disabled={formSubmitting} style={styles.submitBtn}>{formSubmitting ? 'Reporting...' : 'Report'}</button>
            </div>
          </form>
        </div>
      )}

      {showAddItem && (
        <div style={styles.modalOverlay} onClick={() => setShowAddItem(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addItem}>
            <p style={styles.modalTitle}>Add consumable item</p>
            <input aria-label="Item name" name="name" placeholder="Item name" required style={styles.input} />
            <input aria-label="Unit" name="unit" placeholder="Unit (e.g. litres, boxes)" style={styles.input} />
            <input aria-label="Quantity on hand" name="quantity_on_hand" type="number" placeholder="Quantity on hand" style={styles.input} />
            <input aria-label="Reorder threshold" name="reorder_threshold" type="number" placeholder="Reorder threshold" style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddItem(false)}>Cancel</button>
              <button type="submit" disabled={formSubmitting} style={styles.submitBtn}>{formSubmitting ? 'Adding...' : 'Add'}</button>
            </div>
          </form>
        </div>
      )}

      {showSupportModal && (
        <ContactSupportModal
          businessId={business?.id}
          defaultContact={business?.contact_email}
          onClose={() => setShowSupportModal(false)}
        />
      )}

      {showNotificationSettings && (
        <div style={styles.modalOverlay} onClick={() => setShowNotificationSettings(false)}>
          <div style={styles.modal} onClick={e => e.stopPropagation()}>
            <p style={styles.modalTitle}>Notification settings</p>
            <label htmlFor="industrial-slack-webhook" style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6 }}>
              Slack webhook URL (optional)
            </label>
            <input
              id="industrial-slack-webhook"
              aria-label="Slack webhook URL"
              type="text"
              value={slackWebhookInput}
              onChange={e => setSlackWebhookInput(e.target.value)}
              style={styles.input}
              placeholder="https://hooks.slack.com/services/..."
            />
            <p style={{ color: '#888', fontSize: 12, margin: '6px 0 0' }}>
              Get one from your Slack workspace: Settings &gt; Apps &gt; Incoming Webhooks.
              Used to post lead, asset, safety, and compliance alerts from the Conductor
              and the other autonomous agents on this side to your own channel. Treat it
              like a secret.
            </p>
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowNotificationSettings(false)}>Cancel</button>
              <button type="button" disabled={savingNotificationSettings} onClick={saveNotificationSettings} style={styles.submitBtn}>
                {savingNotificationSettings ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', fontFamily: 'Arial, sans-serif' },
  header: { padding: '20px 28px', borderBottom: '1px solid #1e293b' },
  bizLabel: { color: '#888', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', margin: '0 0 16px' },
  subscriptionCancelledBanner: { background: '#2A0F0F', border: '1px solid #8A2525', borderRadius: 8, padding: '8px 10px', margin: '0 0 12px', maxWidth: 480 },
  subscriptionCancelledTitle: { color: '#e05555', fontSize: 12, fontWeight: 'bold', margin: '0 0 4px' },
  subscriptionCancelledLine: { color: '#ccc', fontSize: 11, lineHeight: 1.4, margin: 0 },
  tabRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tabBtn: (active) => ({ background: active ? '#2D5FA822' : 'transparent', color: active ? '#8fd0e8' : '#666', border: `1px solid ${active ? '#2D5FA8' : '#1e293b'}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }),
  tabCount: { background: '#8A2525', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10, marginLeft: 4 },
  body: { padding: '20px 28px', maxWidth: 720 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { color: '#888', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 12px' },
  emptyText: { color: '#666', fontSize: 13, lineHeight: 1.5 },
  addBtn: { background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' },
  row: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 12, padding: '14px 16px', marginBottom: 10 },
  rowTitle: { color: '#fff', fontSize: 15, fontWeight: 'bold', margin: '0 0 4px' },
  rowMeta: { color: '#666', fontSize: 12, margin: '0 0 4px' },
  rowDesc: { color: '#8899a6', fontSize: 13, margin: '0 0 6px', lineHeight: 1.4 },
  rowActions: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 },
  statusBadge: (status) => ({
    fontSize: 10, fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase', padding: '3px 8px', borderRadius: 6,
    color: ['open', 'pending sign-off', 'new'].includes(status) ? '#A87C16' : ['acknowledged', 'signed off', 'available'].includes(status) ? '#1D9E75' : '#2D5FA8',
    background: ['open', 'pending sign-off', 'new'].includes(status) ? '#A87C1622' : ['acknowledged', 'signed off', 'available'].includes(status) ? '#1D9E7522' : '#2D5FA822',
  }),
  smallBtn: { background: 'transparent', border: '1px solid #1e293b', color: '#8fd0e8', borderRadius: 8, padding: '5px 10px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer' },
  smallSelect: { background: '#0b1622', border: '1px solid #1e293b', color: '#cbd5e1', borderRadius: 8, padding: '5px 8px', fontSize: 11 },
  correctiveActionBox: { marginTop: 8, paddingTop: 8, borderTop: '1px dashed #1e293b' },
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 16, padding: 28, width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1B2B4B', margin: '0 0 8px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  modalActions: { display: 'flex', gap: 10, marginTop: 8 },
  submitBtn: { flex: 1, background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, fontWeight: 'bold', cursor: 'pointer' },
  cancelBtn: { flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, cursor: 'pointer' },
  overviewGrid: { display: 'flex', flexWrap: 'wrap', gap: 10 },
  overviewCard: { background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: 12, padding: '14px 16px', minWidth: 150, flex: '1 1 150px', cursor: 'pointer', textAlign: 'left', display: 'block', font: 'inherit' },
  overviewCardValue: (color) => ({ color: color || '#fff', fontSize: 24, fontWeight: 'bold', margin: '0 0 2px' }),
  overviewCardLabel: { color: '#8899a6', fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 0 2px' },
  overviewCardSub: { color: '#888', fontSize: 11, margin: 0 },
}
