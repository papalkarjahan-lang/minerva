import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { insertTechniciansWithPinRetry } from '../utils'

const TRADE_TYPES = ['Plumber','Electrician','HVAC / Refrigeration','Locksmith','Pest Control','Commercial Cleaning','Pool Service','Courier / Delivery','Security Patrol','Automotive Mobile Service','Mobile Veterinary','Other']
const CITIES = ['Sydney','Melbourne','Brisbane','Perth','Adelaide','Canberra','Newcastle','Wollongong','Geelong','Townsville','Toowoomba','Other']

// Setup-stage personalization checklist — captures which departments/features
// matter most to THIS business, shown back to them and informational only
// (see feature_priorities column). Different list per sector since the
// department names differ between the trade and industrial consoles.
const FEATURE_PRIORITIES_TRADE = [
  'Fast lead response (Front Desk)', 'On-time dispatch & routing (Dispatch & Crew)',
  'Getting paid faster (Ledger)', 'Compliance / dispute protection (Watchtower)',
  'Marketing & referrals (Growth)',
]
const FEATURE_PRIORITIES_INDUSTRIAL = [
  'Qualified B2B leads (Signal & Enrich)', 'Equipment utilization (Route Optimizer)',
  'Asset uptime & maintenance (Telemetry)', 'On-site safety (The Warden)',
  'Client sign-off evidence (The Closer)',
]

// Base per-technician monthly price for each tier.
const TIERS = [
  { id: 'starter', name: 'Starter', price: 49, blurb: 'Live GPS map, client ETA SMS, job start/complete' },
  { id: 'standard', name: 'Standard', price: 79, blurb: 'Everything in Starter + dispatch board, automatic intake chat & lead scoring, job scheduling' },
  { id: 'pro', name: 'Pro', price: 119, blurb: 'Everything in Standard + on-site invoicing, asset tracking, compliance checklists' },
]

export default function Onboarding() {
  const [step, setStep] = useState(1) // 1 = business details, 2 = technicians, 3 = review
  const [biz, setBiz] = useState({ name: '', trade_type: '', city: '', contact_email: '', contact_phone: '' })
  const [sector, setSector] = useState('trade') // 'trade' | 'industrial'
  const [featurePriorities, setFeaturePriorities] = useState([])
  const [techs, setTechs] = useState([{ name: '', phone: '' }])
  const [tier, setTier] = useState('standard')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  function selectTier(id) {
    setTier(id)
  }

  const perTechPrice = TIERS.find(t => t.id === tier).price

  function updateBiz(field) { return (e) => setBiz(prev => ({ ...prev, [field]: e.target.value })) }
  function toggleFeaturePriority(label) {
    setFeaturePriorities(prev => prev.includes(label) ? prev.filter(f => f !== label) : [...prev, label])
  }
  function updateTech(i, field) { return (e) => setTechs(prev => prev.map((t, idx) => idx === i ? { ...t, [field]: e.target.value } : t)) }
  function addTech() { setTechs(prev => [...prev, { name: '', phone: '' }]) }
  function removeTech(i) { setTechs(prev => prev.filter((_, idx) => idx !== i)) }

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    try {
      // 1. Create business
      const { data: bizData, error: bizErr } = await supabase
        .from('businesses')
        .insert({ ...biz, subscription_tier: tier, sector, feature_priorities: featurePriorities })
        .select()
        .single()
      if (bizErr) throw new Error(bizErr.message)

      // 2. Create technicians with PINs
      const techRows = techs.filter(t => t.name.trim()).map(t => ({
        business_id: bizData.id,
        name: t.name.trim(),
        phone: t.phone.trim(),
      }))
      const { data: techData, error: techErr } = await insertTechniciansWithPinRetry(supabase, techRows)
      if (techErr) throw new Error(techErr.message)

      // 3. Send each technician their setup SMS
      const appUrl = import.meta.env.VITE_APP_URL
      for (const tech of techData) {
        await supabase.functions.invoke('send-setup-sms', {
          body: {
            phone: tech.phone,
            name: tech.name,
            businessName: bizData.name,
            techUrl: `${appUrl}/tech?pin=${tech.pin}`
          }
        })
      }

      // 4. Redirect to Stripe checkout
      // IMPORTANT: Create matching price IDs in your Stripe dashboard first —
      // Starter: $49/tech/month | Standard: $79/tech/month | Pro: $119/tech/month
      const techCount = techData.length
      const response = await supabase.functions.invoke('create-checkout-session', {
        body: {
          businessId: bizData.id,
          businessName: bizData.name,
          contactEmail: biz.contact_email,
          techCount,
          tier
        }
      })
      if (response.error) throw new Error(response.error.message)
      const { sessionUrl } = response.data
      window.location.href = sessionUrl

    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={styles.screen}>
      <div style={styles.card}>
        {/* Logo */}
        <div style={styles.logo}>MINERVA</div>
        <p style={styles.subtitle}>Set up your team in 5 minutes</p>

        {/* Step 1: Business details */}
        {step === 1 && (
          <>
            <h2 style={styles.stepTitle}>Your business</h2>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>What kind of business is this?</label>
              <div style={styles.sectorToggle}>
                <div onClick={() => setSector('trade')}
                  style={{ ...styles.sectorOption, ...(sector === 'trade' ? styles.sectorOptionActive : {}) }}>
                  <p style={styles.sectorOptionName}>Trade</p>
                  <p style={styles.sectorOptionBlurb}>Plumbers, electricians, HVAC, and other on-demand home/commercial trades</p>
                </div>
                <div onClick={() => setSector('industrial')}
                  style={{ ...styles.sectorOption, ...(sector === 'industrial' ? styles.sectorOptionActive : {}) }}>
                  <p style={styles.sectorOptionName}>Industrial</p>
                  <p style={styles.sectorOptionBlurb}>Heavy equipment, multi-day site work, asset tracking, and B2B contracts</p>
                </div>
              </div>
            </div>

            {[
              ['Business name', 'name', 'text'],
              ['Your email', 'contact_email', 'email'],
              ['Your mobile', 'contact_phone', 'tel'],
            ].map(([label, field, type]) => (
              <div key={field} style={styles.fieldGroup}>
                <label style={styles.label}>{label}</label>
                <input type={type} value={biz[field]} onChange={updateBiz(field)}
                  required style={styles.input} />
              </div>
            ))}
            <div style={styles.fieldGroup}>
              <label style={styles.label}>{sector === 'industrial' ? 'Primary equipment / service focus' : 'Trade type'}</label>
              {sector === 'industrial' ? (
                <input type="text" placeholder="e.g. Crane hire, earthmoving, industrial electrical"
                  value={biz.trade_type} onChange={updateBiz('trade_type')} style={styles.input} />
              ) : (
                <select value={biz.trade_type} onChange={updateBiz('trade_type')} style={styles.select}>
                  <option value="">Select...</option>
                  {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>City</label>
              <select value={biz.city} onChange={updateBiz('city')} style={styles.select}>
                <option value="">Select...</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={styles.fieldGroup}>
              <label style={styles.label}>What matters most to you? <span style={styles.labelOptional}>(optional)</span></label>
              {(sector === 'industrial' ? FEATURE_PRIORITIES_INDUSTRIAL : FEATURE_PRIORITIES_TRADE).map(label => (
                <div key={label}
                  onClick={() => toggleFeaturePriority(label)}
                  style={{ ...styles.priorityRow, ...(featurePriorities.includes(label) ? styles.priorityRowActive : {}) }}>
                  <span style={styles.priorityCheck}>{featurePriorities.includes(label) ? '✓' : ''}</span>
                  <span>{label}</span>
                </div>
              ))}
            </div>

            <button style={styles.nextBtn}
              disabled={!biz.name || !biz.contact_email || !biz.trade_type || !biz.city}
              onClick={() => setStep(2)}>
              Next: Add Technicians →
            </button>
          </>
        )}

        {/* Step 2: Technicians */}
        {step === 2 && (
          <>
            <h2 style={styles.stepTitle}>Your technicians</h2>
            <p style={styles.helpText}>Add each technician's name and mobile number. They'll receive a setup text.</p>
            {techs.map((tech, i) => (
              <div key={i} style={styles.techInputRow}>
                <input placeholder="Name" value={tech.name} onChange={updateTech(i, 'name')}
                  style={{ ...styles.input, flex: 1 }} />
                <input placeholder="Mobile (04xx...)" value={tech.phone} onChange={updateTech(i, 'phone')}
                  type="tel" style={{ ...styles.input, flex: 1 }} />
                {techs.length > 1 && (
                  <button onClick={() => removeTech(i)} style={styles.removeBtn}>✕</button>
                )}
              </div>
            ))}
            <button onClick={addTech} style={styles.addTechBtn}>+ Add another technician</button>

            {/* Plan tier */}
            <p style={styles.label}>Choose your plan</p>
            <div style={styles.tierGrid}>
              {TIERS.map(t => (
                <div key={t.id}
                  onClick={() => selectTier(t.id)}
                  style={{ ...styles.tierCard, ...(tier === t.id ? styles.tierCardActive : {}) }}>
                  <p style={styles.tierName}>{t.name}</p>
                  <p style={styles.tierPrice}>${t.price}<span style={styles.tierPriceUnit}>/tech/mo</span></p>
                  <p style={styles.tierBlurb}>{t.blurb}</p>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button style={styles.backBtn} onClick={() => setStep(1)}>← Back</button>
              <button style={styles.nextBtn}
                disabled={!techs.some(t => t.name.trim())}
                onClick={() => setStep(3)}>
                Review →
              </button>
            </div>
          </>
        )}

        {/* Step 3: Review and pay */}
        {step === 3 && (
          <>
            <h2 style={styles.stepTitle}>Review your order</h2>
            <div style={styles.reviewBox}>
              <p style={styles.reviewLine}><strong>Business:</strong> {biz.name}</p>
              <p style={styles.reviewLine}><strong>Sector:</strong> {sector === 'industrial' ? 'Industrial' : 'Trade'}</p>
              <p style={styles.reviewLine}><strong>{sector === 'industrial' ? 'Focus' : 'Trade'}:</strong> {biz.trade_type}</p>
              <p style={styles.reviewLine}><strong>City:</strong> {biz.city}</p>
              <p style={styles.reviewLine}><strong>Technicians:</strong> {techs.filter(t=>t.name.trim()).length}</p>
              <p style={styles.reviewLine}><strong>Plan:</strong> {TIERS.find(t => t.id === tier).name}</p>
              <div style={styles.divider} />
              <p style={styles.priceCalc}>
                {techs.filter(t=>t.name.trim()).length} technicians × ${perTechPrice}/month
              </p>
              <p style={styles.totalPrice}>
                ${techs.filter(t=>t.name.trim()).length * perTechPrice}/month
              </p>
              <p style={styles.trialNote}>✓ 7-day free trial — no charge today</p>
            </div>
            <label style={styles.agreeRow}>
              <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)} style={{ marginTop: 2 }} />
              <span>
                I agree to Minerva's <Link to="/terms" target="_blank" style={styles.agreeLink}>Terms of Service</Link>,{' '}
                <Link to="/privacy" target="_blank" style={styles.agreeLink}>Privacy Policy</Link>, and{' '}
                <Link to="/refund-policy" target="_blank" style={styles.agreeLink}>Refund Policy</Link>.
              </span>
            </label>
            {error && <p style={styles.errorText}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
              <button style={styles.submitBtn} disabled={loading || !agreedToTerms} onClick={handleSubmit}>
                {loading ? 'Setting up your account...' : 'Start free trial'}
              </button>
            </div>
            <p style={styles.secureNote}>🔒 Card details secured by Stripe. Cancel anytime.</p>
          </>
        )}
      </div>
    </div>
  )
}

const styles = {
  screen: { minHeight: '100vh', background: '#f0f2f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, fontFamily: 'Arial, sans-serif' },
  card: { background: '#fff', borderRadius: 20, padding: 36, width: '100%', maxWidth: 480, boxShadow: '0 4px 30px rgba(0,0,0,0.1)' },
  logo: { fontSize: 26, fontWeight: 'bold', color: '#1B2B4B', letterSpacing: 3, marginBottom: 4 },
  subtitle: { color: '#888', fontSize: 14, margin: '0 0 28px' },
  stepTitle: { color: '#1B2B4B', fontSize: 20, fontWeight: 'bold', margin: '0 0 18px' },
  fieldGroup: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 'bold', color: '#444', marginBottom: 6 },
  labelOptional: { fontWeight: 'normal', color: '#999', textTransform: 'none', letterSpacing: 0 },
  sectorToggle: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  sectorOption: { border: '1px solid #ddd', borderRadius: 12, padding: '12px 12px', cursor: 'pointer' },
  sectorOptionActive: { border: '2px solid #2D5FA8', background: '#f8f9ff', padding: '11px 11px' },
  sectorOptionName: { fontSize: 14, fontWeight: 'bold', color: '#1B2B4B', margin: '0 0 4px' },
  sectorOptionBlurb: { fontSize: 11, color: '#777', lineHeight: 1.4, margin: 0 },
  priorityRow: { display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #eee', borderRadius: 10, padding: '9px 12px', marginBottom: 6, cursor: 'pointer', fontSize: 13, color: '#444' },
  priorityRowActive: { border: '1px solid #2D5FA8', background: '#f8f9ff', color: '#1B2B4B' },
  priorityCheck: { width: 16, textAlign: 'center', color: '#2D5FA8', fontWeight: 'bold' },
  input: { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  select: { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, background: '#fff', cursor: 'pointer' },
  nextBtn: { width: '100%', background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', marginTop: 8 },
  backBtn: { flex: '0 0 80px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 14, cursor: 'pointer' },
  submitBtn: { flex: 1, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 'bold', cursor: 'pointer' },
  agreeRow: { display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: '#666', lineHeight: 1.5, margin: '14px 0' },
  agreeLink: { color: '#2D5FA8', textDecoration: 'none' },
  helpText: { color: '#666', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 },
  techInputRow: { display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' },
  removeBtn: { background: 'none', border: '1px solid #ddd', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#888', fontSize: 14 },
  addTechBtn: { background: 'none', border: '1px dashed #2D5FA8', color: '#2D5FA8', borderRadius: 10, padding: '10px 16px', fontSize: 14, cursor: 'pointer', width: '100%', marginBottom: 20 },
  tierGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 20 },
  tierCard: { border: '1px solid #ddd', borderRadius: 12, padding: '12px 10px', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s' },
  tierCardActive: { border: '2px solid #2D5FA8', background: '#f8f9ff', padding: '11px 9px' },
  tierName: { fontSize: 13, fontWeight: 'bold', color: '#1B2B4B', margin: '0 0 4px' },
  tierPrice: { fontSize: 17, fontWeight: 'bold', color: '#1B2B4B', margin: '0 0 6px' },
  tierPriceUnit: { fontSize: 10, fontWeight: 'normal', color: '#888' },
  tierBlurb: { fontSize: 10.5, color: '#777', lineHeight: 1.4, margin: 0 },
  reviewBox: { background: '#f8f9ff', borderRadius: 14, padding: 20, marginBottom: 20 },
  reviewLine: { margin: '0 0 8px', fontSize: 14, color: '#444' },
  divider: { height: 1, background: '#eee', margin: '12px 0' },
  priceCalc: { color: '#888', fontSize: 14, margin: '0 0 4px' },
  totalPrice: { color: '#1B2B4B', fontSize: 26, fontWeight: 'bold', margin: '0 0 8px' },
  trialNote: { color: '#1D9E75', fontSize: 13, fontWeight: 'bold', margin: 0 },
  errorText: { color: '#8A2525', fontSize: 13, margin: '0 0 12px' },
  secureNote: { color: '#aaa', fontSize: 12, textAlign: 'center', marginTop: 12 }
}
