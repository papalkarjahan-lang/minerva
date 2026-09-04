import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { timeAgo } from '../utils'

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
  const [packages, setPackages] = useState([])
  const [tab, setTab] = useState('leads') // 'leads' | 'sites' | 'assets' | 'inventory' | 'safety' | 'verification'
  const [showAddLead, setShowAddLead] = useState(false)
  const [showAddSite, setShowAddSite] = useState(false)
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [showAddItem, setShowAddItem] = useState(false)
  const [showAddIncident, setShowAddIncident] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [expandedAssetId, setExpandedAssetId] = useState(null)
  const [assetEvents, setAssetEvents] = useState({}) // asset_id -> asset_telemetry_events rows, fetched lazily
  const [expandedSiteId, setExpandedSiteId] = useState(null)
  const [siteCheckins, setSiteCheckins] = useState({}) // site_id -> site_checkins rows, fetched lazily

  useEffect(() => { loadAll() }, [businessId])

  async function loadAll() {
    const { data: biz } = await supabase.from('businesses').select('*').eq('id', businessId).single()
    setBusiness(biz)

    const { data: leadList } = await supabase.from('industrial_leads')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setLeads(leadList || [])

    const { data: siteList } = await supabase.from('site_projects')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setSites(siteList || [])

    const { data: assetList } = await supabase.from('industrial_assets')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setAssets(assetList || [])

    const { data: itemList } = await supabase.from('consumables_items')
      .select('*').eq('business_id', businessId).order('name', { ascending: true })
    setConsumables(itemList || [])

    const { data: incidentList } = await supabase.from('safety_incidents')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setIncidents(incidentList || [])

    const { data: packageList } = await supabase.from('client_verification_packages')
      .select('*').eq('business_id', businessId).order('created_at', { ascending: false })
    setPackages(packageList || [])
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

  async function addLead(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    await supabase.from('industrial_leads').insert({
      business_id: businessId,
      company_name: f.get('company_name'),
      source: f.get('source') || 'manual',
      intent_signal: f.get('intent_signal'),
      equipment_need: f.get('equipment_need'),
      estimated_size: f.get('estimated_size'),
      status: 'new',
    })
    setShowAddLead(false)
    loadAll()
  }

  async function addSite(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    await supabase.from('site_projects').insert({
      business_id: businessId,
      industrial_lead_id: f.get('industrial_lead_id') || null,
      name: f.get('name'),
      scope_of_work: f.get('scope_of_work'),
      status: 'active',
    })
    setShowAddSite(false)
    loadAll()
  }

  async function addAsset(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    await supabase.from('industrial_assets').insert({
      business_id: businessId,
      name: f.get('name'),
      asset_type: f.get('asset_type'),
      tag_id: f.get('tag_id') || null,
      status: 'available',
    })
    setShowAddAsset(false)
    loadAll()
  }

  async function addItem(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    await supabase.from('consumables_items').insert({
      business_id: businessId,
      name: f.get('name'),
      unit: f.get('unit') || 'unit',
      quantity_on_hand: Number(f.get('quantity_on_hand')) || 0,
      reorder_threshold: Number(f.get('reorder_threshold')) || 0,
    })
    setShowAddItem(false)
    loadAll()
  }

  async function runConductor(leadId) {
    setBusyId(leadId)
    await supabase.functions.invoke('industrial-conductor', { body: { leadId } }).catch(() => {})
    setBusyId(null)
  }

  async function generatePackage(siteId) {
    setBusyId(siteId)
    await supabase.functions.invoke('package-client-verification', { body: { siteId } }).catch(() => {})
    setBusyId(null)
    loadAll()
  }

  async function acknowledgeIncident(id) {
    await supabase.from('safety_incidents').update({ acknowledged_at: new Date().toISOString() }).eq('id', id)
    loadAll()
  }

  // Previously there was no way to clear reorder_requested_at from the UI
  // at all — track-consumables sets it and the item just sits flagged
  // "LOW STOCK" forever, even after someone actually restocks it, since
  // clearing it is what re-arms the alert for next time (see
  // track-consumables' header comment).
  async function restockItem(id) {
    await supabase.from('consumables_items').update({ reorder_requested_at: null }).eq('id', id)
    loadAll()
  }

  // Previously the only way a safety_incidents row was ever created was
  // via detect-safety-hazards' automated proximity check — a site manager
  // calling in an observed hazard had no way to log it except a direct DB
  // insert. This adds the missing manual-report path.
  async function addIncident(e) {
    e.preventDefault()
    const f = new FormData(e.target)
    await supabase.from('safety_incidents').insert({
      business_id: businessId,
      site_id: f.get('site_id') || null,
      severity: f.get('severity') || 'warning',
      description: f.get('description'),
    })
    setShowAddIncident(false)
    loadAll()
  }

  const openIncidents = incidents.filter(i => !i.acknowledged_at)

  return (
    <div style={styles.screen}>
      <div style={styles.header}>
        <div>
          <p style={styles.bizLabel}>INDUSTRIAL SECTOR</p>
          <h1 style={styles.title}>{business?.name || '...'}</h1>
        </div>
        <div style={styles.tabRow}>
          {[
            ['leads', 'Signal & Enrich', leads.length],
            ['sites', 'Site Ops', sites.length],
            ['assets', 'Telemetry & Audit', assets.length],
            ['inventory', 'Quartermaster', consumables.length],
            ['safety', 'The Warden', openIncidents.length],
            ['verification', 'The Closer', packages.length],
          ].map(([id, label, count]) => (
            <button key={id} onClick={() => setTab(id)} style={styles.tabBtn(tab === id)}>
              {label} {count > 0 && <span style={styles.tabCount}>{count}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={styles.body}>
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
                {expandedSiteId === s.id && (
                  <div style={{ marginTop: 10, borderTop: '1px solid #1e293b', paddingTop: 8 }}>
                    {(siteCheckins[s.id] || []).length > 0 ? (
                      siteCheckins[s.id].map(c => (
                        <p key={c.id} style={styles.rowMeta}>
                          <span style={styles.statusBadge(c.role === 'human_technician' ? 'available' : 'pending sign-off')}>
                            {c.role === 'human_technician' ? 'HUMAN' : 'AUTOMATED'}
                          </span>
                          {' '}{c.person_name || 'unknown'} — {c.checkin_type.replace('_', ' ')}
                          {c.detail ? ` (${c.detail})` : ''}
                          <span style={{ color: '#444' }}> · {timeAgo(c.created_at)}</span>
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
            {assets.length === 0 && <p style={styles.emptyText}>No assets registered yet.</p>}
            {assets.map(a => (
              <div key={a.id} style={styles.row}>
                <div style={{ cursor: 'pointer' }} onClick={() => toggleAssetDetails(a.id)}>
                  <p style={styles.rowTitle}>{a.name}</p>
                  <p style={styles.rowMeta}>{a.asset_type} · {a.tag_id ? `tag ${a.tag_id}` : 'no tag id'} · {a.engine_hours || 0} engine hrs</p>
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
                          <span style={{ color: '#444' }}> · {timeAgo(ev.created_at)}</span>
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
                      <button style={styles.smallBtn} onClick={() => restockItem(c.id)}>Mark restocked</button>
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
              <button style={styles.addBtn} onClick={() => setShowAddIncident(true)}>+ Report incident</button>
            </div>
            {incidents.length === 0 && <p style={styles.emptyText}>No incidents recorded.</p>}
            {incidents.map(i => (
              <div key={i.id} style={styles.row}>
                <p style={styles.rowDesc}>{i.description}</p>
                <p style={styles.rowMeta}>{i.severity} · {timeAgo(i.created_at)}</p>
                <div style={styles.rowActions}>
                  <span style={styles.statusBadge(i.acknowledged_at ? 'acknowledged' : 'open')}>{i.acknowledged_at ? 'acknowledged' : 'open'}</span>
                  {!i.acknowledged_at && (
                    <button style={styles.smallBtn} onClick={() => acknowledgeIncident(i.id)}>Acknowledge</button>
                  )}
                </div>
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
                <span style={styles.statusBadge(p.signed_off_at ? 'signed off' : 'pending sign-off')}>{p.signed_off_at ? 'signed off' : 'pending sign-off'}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {showAddLead && (
        <div style={styles.modalOverlay} onClick={() => setShowAddLead(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addLead}>
            <p style={styles.modalTitle}>Add industrial lead</p>
            <input name="company_name" placeholder="Company name" required style={styles.input} />
            <input name="equipment_need" placeholder="Equipment need" style={styles.input} />
            <input name="estimated_size" placeholder="Estimated size (e.g. 3 units, $50k)" style={styles.input} />
            <input name="intent_signal" placeholder="Intent signal / notes" style={styles.input} />
            <input name="source" placeholder="Source (default: manual)" style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddLead(false)}>Cancel</button>
              <button type="submit" style={styles.submitBtn}>Add</button>
            </div>
          </form>
        </div>
      )}

      {showAddSite && (
        <div style={styles.modalOverlay} onClick={() => setShowAddSite(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addSite}>
            <p style={styles.modalTitle}>Add site project</p>
            <input name="name" placeholder="Site name" required style={styles.input} />
            <input name="scope_of_work" placeholder="Scope of work" style={styles.input} />
            <select name="industrial_lead_id" style={styles.input}>
              <option value="">No linked lead</option>
              {leads.map(l => <option key={l.id} value={l.id}>{l.company_name}</option>)}
            </select>
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddSite(false)}>Cancel</button>
              <button type="submit" style={styles.submitBtn}>Add</button>
            </div>
          </form>
        </div>
      )}

      {showAddAsset && (
        <div style={styles.modalOverlay} onClick={() => setShowAddAsset(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addAsset}>
            <p style={styles.modalTitle}>Add asset</p>
            <input name="name" placeholder="Asset name (e.g. Excavator 3)" required style={styles.input} />
            <input name="asset_type" placeholder="Asset type" style={styles.input} />
            <input name="tag_id" placeholder="RFID / tracker tag ID (optional)" style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddAsset(false)}>Cancel</button>
              <button type="submit" style={styles.submitBtn}>Add</button>
            </div>
          </form>
        </div>
      )}

      {showAddIncident && (
        <div style={styles.modalOverlay} onClick={() => setShowAddIncident(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addIncident}>
            <p style={styles.modalTitle}>Report safety incident</p>
            <select name="site_id" style={styles.input}>
              <option value="">No specific site</option>
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select name="severity" style={styles.input} defaultValue="warning">
              <option value="warning">Warning</option>
              <option value="hazard">Hazard</option>
            </select>
            <input name="description" placeholder="What happened?" required style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddIncident(false)}>Cancel</button>
              <button type="submit" style={styles.submitBtn}>Report</button>
            </div>
          </form>
        </div>
      )}

      {showAddItem && (
        <div style={styles.modalOverlay} onClick={() => setShowAddItem(false)}>
          <form style={styles.modal} onClick={e => e.stopPropagation()} onSubmit={addItem}>
            <p style={styles.modalTitle}>Add consumable item</p>
            <input name="name" placeholder="Item name" required style={styles.input} />
            <input name="unit" placeholder="Unit (e.g. litres, boxes)" style={styles.input} />
            <input name="quantity_on_hand" type="number" placeholder="Quantity on hand" style={styles.input} />
            <input name="reorder_threshold" type="number" placeholder="Reorder threshold" style={styles.input} />
            <div style={styles.modalActions}>
              <button type="button" style={styles.cancelBtn} onClick={() => setShowAddItem(false)}>Cancel</button>
              <button type="submit" style={styles.submitBtn}>Add</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#050811', fontFamily: 'Arial, sans-serif' },
  header: { padding: '20px 28px', borderBottom: '1px solid #1e293b' },
  bizLabel: { color: '#555', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 4px' },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', margin: '0 0 16px' },
  tabRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  tabBtn: (active) => ({ background: active ? '#2D5FA822' : 'transparent', color: active ? '#8fd0e8' : '#666', border: `1px solid ${active ? '#2D5FA8' : '#1e293b'}`, borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }),
  tabCount: { background: '#8A2525', color: '#fff', borderRadius: 10, padding: '0 6px', fontSize: 10, marginLeft: 4 },
  body: { padding: '20px 28px', maxWidth: 720 },
  sectionHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionLabel: { color: '#555', fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 12px' },
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
  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999 },
  modal: { background: '#fff', borderRadius: 16, padding: 28, width: '90%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)', display: 'flex', flexDirection: 'column', gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: '#1B2B4B', margin: '0 0 8px' },
  input: { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box' },
  modalActions: { display: 'flex', gap: 10, marginTop: 8 },
  submitBtn: { flex: 1, background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, fontWeight: 'bold', cursor: 'pointer' },
  cancelBtn: { flex: 1, background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 15, cursor: 'pointer' },
}
