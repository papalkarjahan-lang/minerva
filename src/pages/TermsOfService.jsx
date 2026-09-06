import { Link } from 'react-router-dom'

// Terms of Service — drafted from the actual product behaviour in this
// codebase (Stripe subscription billing, GPS tracking, SMS, AI features,
// optional add-ons). NOT reviewed by a lawyer. Treat this as a strong
// starting draft, not a finished legal document — before relying on this
// for real paying customers, have an Australian solicitor review it
// (particularly the liability/indemnity and Australian Consumer Law
// sections, which have mandatory-guarantee implications this draft only
// gestures at).
export default function TermsOfService() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <Link to="/" style={backLink}>← Minerva</Link>
        <h1 style={h1Style}>Terms of Service</h1>
        <p style={updatedStyle}>Last updated: 6 September 2026</p>

        <Section title="1. Who this agreement is with">
          <p>
            These Terms of Service ("Terms") are an agreement between you, the
            business signing up for Minerva ("you", "your business"), and the
            operator of Minerva ("we", "us", "Minerva"). By creating an
            account, starting a free trial, or using Minerva, you agree to
            these Terms on behalf of your business.
          </p>
        </Section>

        <Section title="2. What Minerva is">
          <p>
            Minerva is field-service management software: technician GPS
            dispatch, client SMS notifications, job/invoice/quote tracking,
            AI-assisted lead intake and checklist photo review, and related
            add-ons, delivered as a hosted web application. Minerva is
            provided "as is" for your internal business use — it is not
            professional legal, financial, tax, or safety-compliance advice,
            even where a feature (e.g. compliance checklists, credential
            expiry tracking) relates to those areas.
          </p>
        </Section>

        <Section title="3. Your account and your data responsibilities">
          <ul style={ulStyle}>
            <li>You're responsible for the accuracy of business, technician, and client information you enter.</li>
            <li>
              You are responsible for obtaining any consent required by law
              from your own technicians before tracking their location
              through Minerva, and from your own clients before sending them
              SMS notifications. Minerva provides the tools; you are the
              employer/contractor relationship and the one required to have
              a lawful basis for using them on your team and your customers.
            </li>
            <li>You're responsible for keeping technician PIN links and admin/login credentials confidential.</li>
            <li>You must not use Minerva to send unlawful, harassing, or unsolicited messages, or for any purpose that breaches applicable law.</li>
          </ul>
        </Section>

        <Section title="4. Subscription, billing, and trial">
          <p>
            Minerva is billed per technician per month via Stripe, at the
            rate for your selected plan (Starter / Standard / Pro) shown at
            signup. New accounts get a 7-day free trial — you will not be
            charged until the trial ends. After the trial, your saved
            payment method is charged automatically each billing period
            until you cancel. See our <Link to="/refund-policy" style={inlineLink}>Refund &amp; Cancellation Policy</Link> for
            how cancellations and refunds work.
          </p>
          <p>
            Optional add-ons (e.g. crew splitting, subcontractor pool, asset
            intelligence) may be enabled on a self-serve basis. Add-on
            pricing, where charged, will be disclosed before you enable it.
          </p>
        </Section>

        <Section title="5. AI-assisted features">
          <p>
            Some features (lead intake chat, quote drafting, checklist photo
            verification, demand/maintenance insights) use third-party AI
            models. These outputs are assistive, not guaranteed accurate —
            you remain responsible for reviewing AI-drafted quotes, AI photo
            verification results, and AI-surfaced insights before relying on
            them for business, compliance, or dispute purposes.
          </p>
        </Section>

        <Section title="6. Service availability">
          <p>
            We aim for reliable uptime but do not guarantee uninterrupted or
            error-free service. Minerva depends on third-party providers
            (hosting, SMS, mapping, payments, AI) that are themselves outside
            our control. We are not liable for outages or failures caused by
            those providers.
          </p>
        </Section>

        <Section title="7. Limitation of liability">
          <p>
            To the maximum extent permitted by law, Minerva is not liable for
            indirect, incidental, or consequential losses (including lost
            revenue or lost data) arising from your use of the service.
            Nothing in these Terms excludes any guarantee, right, or remedy
            you have under the Australian Consumer Law that cannot lawfully
            be excluded.
          </p>
        </Section>

        <Section title="8. Termination">
          <p>
            You may cancel at any time from your dashboard or by contacting
            support. We may suspend or terminate an account for non-payment,
            abuse, or breach of these Terms, with reasonable notice where
            practical.
          </p>
        </Section>

        <Section title="9. Changes to these Terms">
          <p>
            We may update these Terms from time to time. Continued use of
            Minerva after an update means you accept the revised Terms.
          </p>
        </Section>

        <Section title="10. Governing law">
          <p>These Terms are governed by the laws of Australia.</p>
        </Section>

        <Section title="11. Contact">
          <p>
            Questions about these Terms can be sent through the "Contact
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
