import { Link } from 'react-router-dom'

// Privacy Policy — drafted from the actual data flows in this codebase
// (see SECURITY_NOTES.md for the underlying technical detail). NOT
// reviewed by a lawyer or privacy professional. This is a strong starting
// draft based on what the product genuinely collects and sends to which
// providers, not boilerplate — but if you're handling real Australian
// clients' personal information (location data in particular), get a
// privacy-law review before relying on it, and confirm whether the
// Australian Privacy Act's APPs apply to your business's turnover/activities.
export default function PrivacyPolicy() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <Link to="/" style={backLink}>← Minerva</Link>
        <h1 style={h1Style}>Privacy Policy</h1>
        <p style={updatedStyle}>Last updated: 6 September 2026</p>

        <Section title="1. What this covers">
          <p>
            This policy explains what personal information Minerva collects
            when a business, its technicians, and its clients use the
            product, and how that information is used, stored, and shared.
          </p>
        </Section>

        <Section title="2. Information we collect">
          <ul style={ulStyle}>
            <li><strong>Business account data:</strong> business name, trade type, city, contact email/phone, subscription tier.</li>
            <li><strong>Technician data:</strong> name, phone number, a login PIN, and — while on the clock — real-time GPS location, used to power dispatch and client ETA tracking.</li>
            <li><strong>Client data:</strong> name, phone number, address, and job/quote/invoice details, entered by the business or its technicians to deliver a job.</li>
            <li><strong>Job evidence:</strong> checklist completion photos, GPS route history for a job, and materials/notes recorded by technicians.</li>
            <li><strong>Payment data:</strong> subscription billing is handled entirely by Stripe. Minerva does not receive or store your card number — Stripe processes and stores that directly.</li>
            <li><strong>Support messages:</strong> anything submitted through the in-app "Contact support" form.</li>
          </ul>
        </Section>

        <Section title="3. How we use this information">
          <ul style={ulStyle}>
            <li>To operate the core service: dispatch, live tracking links, SMS notifications, invoicing/quoting, and compliance checklists.</li>
            <li>To power optional AI-assisted features (lead intake triage, quote drafting, checklist photo verification, demand/maintenance insights) — these are processed by a third-party AI provider (see below) and are not used to train that provider's models beyond their own standard API terms.</li>
            <li>To send transactional SMS/email (ETA notices, invoices, setup links, support replies).</li>
            <li>To bill your subscription via Stripe.</li>
          </ul>
        </Section>

        <Section title="4. Who we share information with">
          <p>We share information only with the service providers needed to run the features above, and only the data each one needs:</p>
          <ul style={ulStyle}>
            <li><strong>Supabase</strong> — database, authentication, and file storage (checklist photos, credential documents) hosting.</li>
            <li><strong>Stripe</strong> — subscription billing and payment processing.</li>
            <li><strong>Twilio</strong> — sending SMS notifications to technicians and clients.</li>
            <li><strong>Mapbox</strong> — map rendering and route display.</li>
            <li><strong>Anthropic (Claude)</strong> — AI lead-intake chat, quote drafting, and checklist photo verification, when those features are enabled.</li>
            <li><strong>Resend</strong> — transactional email, where configured.</li>
            <li><strong>Meta (Facebook/Instagram)</strong> — only if a business connects its own ad account to use the optional ad-campaign feature; used solely to run that business's own ads.</li>
            <li><strong>Xero</strong> — only if a business connects its own Xero account to sync invoices.</li>
          </ul>
          <p>We do not sell personal information to third parties.</p>
        </Section>

        <Section title="5. Data retention">
          <p>
            We retain account, job, and technician data for as long as a
            business's account is active, plus a reasonable period after
            cancellation in case of billing disputes or reactivation. You can
            request deletion of your business's data by contacting support;
            we'll action reasonable requests subject to any legal record-
            keeping obligations (e.g. invoicing/tax records).
          </p>
        </Section>

        <Section title="6. Location data specifically">
          <p>
            Technician GPS location is collected only while a technician is
            logged into the field app for an active job, and is used to
            power the live dispatch map and client ETA tracking links. It is
            each business's responsibility, as the technician's employer or
            contracting party, to inform technicians that this tracking
            occurs — see our <Link to="/terms" style={inlineLink}>Terms of Service</Link>.
          </p>
        </Section>

        <Section title="7. Security">
          <p>
            We use industry-standard hosting and access controls provided by
            our infrastructure providers. No online service can guarantee
            absolute security; if we become aware of a data breach affecting
            your information, we will notify you as required by law.
          </p>
        </Section>

        <Section title="8. Your rights">
          <p>
            Depending on your location, you may have rights to access,
            correct, or request deletion of personal information we hold
            about you. To exercise these rights, contact us through the
            in-app "Contact support" form or the details in our homepage
            footer.
          </p>
        </Section>

        <Section title="9. Changes to this policy">
          <p>
            We may update this policy from time to time; continued use of
            Minerva after an update means you accept the revised policy.
          </p>
        </Section>

        <Section title="10. Contact">
          <p>
            Privacy questions or requests can be sent through the "Contact
            support" option inside your dashboard, or to the contact details
            in the footer of our homepage.
          </p>
        </Section>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={h2Style}>{title}</h2>
      {children}
    </div>
  )
}

const pageStyle = { fontFamily: 'Arial, sans-serif', background: '#050811', minHeight: '100vh', color: '#ccc' }
const containerStyle = { maxWidth: 760, margin: '0 auto', padding: '48px 24px 80px' }
const backLink = { color: '#8fd0e8', textDecoration: 'none', fontSize: 14 }
const h1Style = { color: '#fff', fontSize: 32, margin: '24px 0 4px' }
const h2Style = { color: '#fff', fontSize: 18, margin: '0 0 10px' }
const updatedStyle = { color: '#555', fontSize: 13, margin: '0 0 32px' }
const ulStyle = { paddingLeft: 20, lineHeight: 1.7 }
const inlineLink = { color: '#8fd0e8' }
