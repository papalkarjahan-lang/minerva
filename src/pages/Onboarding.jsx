import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { generatePin } from '../utils'
import { loadStripe } from '@stripe/stripe-js'

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)

const TRADE_TYPES = ['Plumber','Electrician','HVAC / Refrigeration','Locksmith','Pest Control','Commercial Cleaning','Pool Service','Other']
const CITIES = ['Sydney','Melbourne','Brisbane','Perth','Adelaide','Canberra','Newcastle','Wollongong','Geelong','Townsville','Toowoomba','Other']

export default function Onboarding() {
  const [step, setStep] = useState(1) // 1 = business details, 2 = technicians, 3 = review
  const [biz, setBiz] = useState({ name: '', trade_type: '', city: '', contact_email: '', contact_phone: '' })
  const [techs, setTechs] = useState([{ name: '', phone: '' }])
  const [dataSharing, setDataSharing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  function updateBiz(field) { return (e) => setBiz(prev => ({ ...prev, [field]: e.target.value })) }
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
        .insert({ ...biz, subscription_tier: 'standard', data_sharing_optin: dataSharing })
        .select()
        .single()
      if (bizErr) throw new Error(bizErr.message)

      // 2. Create technicians with PINs
      const techRows = techs.filter(t => t.name.trim()).map(t => ({
        business_id: bizData.id,
        name: t.name.trim(),
        phone: t.phone.trim(),
        pin: generatePin()
      }))
      const { data: techData, error: techErr } = await supabase
        .from('technicians')
        .insert(techRows)
        .select()
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
      // IMPORTANT: Create these price IDs in your Stripe dashboard first
      // Standard: $79/tech/month | Pro: $119/tech/month
      const techCount = techData.length
      const response = await supabase.functions.invoke('create-checkout-session', {
        body: {
          businessId: bizData.id,
          businessName: bizData.name,
          contactEmail: biz.contact_email,
          techCount,
          dataSharing
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
              <label style={styles.label}>Trade type</label>
              <select value={biz.trade_type} onChange={updateBiz('trade_type')} style={styles.select}>
                <option value="">Select...</option>
                {TRADE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>City</label>
              <select value={biz.city} onChange={updateBiz('city')} style={styles.select}>
                <option value="">Select...</option>
                {CITIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
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

            {/* Data sharing */}
            <div style={styles.dataSharingBox}>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={dataSharing} onChange={e => setDataSharing(e.target.checked)}
                  style={{ marginTop: 2 }} />
                <span style={{ fontSize: 13, color: '#555', lineHeight: 1.5 }}>
                  <strong>Save 15% ($67/tech/month)</strong> by opting in to anonymised data sharing.
                  Your job locations, pricing, and lead data are shared anonymously with Minerva's
                  market intelligence systems. You can opt out at any time.
                </span>
              </label>
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
              <p style={styles.reviewLine}><strong>Trade:</strong> {biz.trade_type}</p>
              <p style={styles.reviewLine}><strong>City:</strong> {biz.city}</p>
              <p style={styles.reviewLine}><strong>Technicians:</strong> {techs.filter(t=>t.name.trim()).length}</p>
              <div style={styles.divider} />
              <p style={styles.priceCalc}>
                {techs.filter(t=>t.name.trim()).length} technicians × {dataSharing ? '$67' : '$79'}/month
              </p>
              <p style={styles.totalPrice}>
                ${techs.filter(t=>t.name.trim()).length * (dataSharing ? 67 : 79)}/month
              </p>
              <p style={styles.trialNote}>✓ 7-day free trial — no charge today</p>
            </div>
            {error && <p style={styles.errorText}>{error}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={styles.backBtn} onClick={() => setStep(2)}>← Back</button>
              <button style={styles.submitBtn} disabled={loading} onClick={handleSubmit}>
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
  input: { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, boxSizing: 'border-box', outline: 'none' },
  select: { width: '100%', padding: '11px 13px', borderRadius: 10, border: '1px solid #ddd', fontSize: 14, background: '#fff', cursor: 'pointer' },
  nextBtn: { width: '100%', background: '#2D5FA8', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 'bold', cursor: 'pointer', marginTop: 8 },
  backBtn: { flex: '0 0 80px', background: '#f5f5f5', color: '#555', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 14, cursor: 'pointer' },
  submitBtn: { flex: 1, background: '#1D9E75', color: '#fff', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 16, fontWeight: 'bold', cursor: 'pointer' },
  helpText: { color: '#666', fontSize: 13, margin: '0 0 16px', lineHeight: 1.5 },
  techInputRow: { display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' },
  removeBtn: { background: 'none', border: '1px solid #ddd', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', color: '#888', fontSize: 14 },
  addTechBtn: { background: 'none', border: '1px dashed #2D5FA8', color: '#2D5FA8', borderRadius: 10, padding: '10px 16px', fontSize: 14, cursor: 'pointer', width: '100%', marginBottom: 20 },
  dataSharingBox: { background: '#f8f9ff', border: '1px solid #dde4ff', borderRadius: 12, padding: 16, marginBottom: 20 },
  reviewBox: { background: '#f8f9ff', borderRadius: 14, padding: 20, marginBottom: 20 },
  reviewLine: { margin: '0 0 8px', fontSize: 14, color: '#444' },
  divider: { height: 1, background: '#eee', margin: '12px 0' },
  priceCalc: { color: '#888', fontSize: 14, margin: '0 0 4px' },
  totalPrice: { color: '#1B2B4B', fontSize: 26, fontWeight: 'bold', margin: '0 0 8px' },
  trialNote: { color: '#1D9E75', fontSize: 13, fontWeight: 'bold', margin: 0 },
  errorText: { color: '#8A2525', fontSize: 13, margin: '0 0 12px' },
  secureNote: { color: '#aaa', fontSize: 12, textAlign: 'center', marginTop: 12 }
}
