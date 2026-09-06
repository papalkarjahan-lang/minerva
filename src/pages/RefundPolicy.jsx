import { Link } from 'react-router-dom'

// Refund & Cancellation Policy — reflects the actual billing mechanics in
// this codebase: 7-day Stripe trial, per-technician monthly subscription,
// self-serve cancellation via the Stripe Billing Portal (Dispatch sidebar
// -> "Manage billing / Cancel"). NOT reviewed by a lawyer — have this
// checked against Australian Consumer Law's mandatory guarantees before
// relying on it commercially.
export default function RefundPolicy() {
  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <Link to="/" style={backLink}>← Minerva</Link>
        <h1 style={h1Style}>Refund &amp; Cancellation Policy</h1>
        <p style={updatedStyle}>Last updated: 6 September 2026</p>

        <Section title="Free trial">
          <p>
            Every new Minerva account starts with a 7-day free trial. You
            will not be charged during the trial. If you cancel before the
            trial ends, you will not be charged at all.
          </p>
        </Section>

        <Section title="How billing works">
          <p>
            After the trial, Minerva bills monthly per technician, in
            advance, via the payment method on file with Stripe, at the rate
            for your plan (Starter $49 / Standard $79 / Pro $119 AUD per
            technician per month). Adding or removing technicians changes
            your bill from the next billing cycle.
          </p>
        </Section>

        <Section title="How to cancel">
          <p>
            Cancel any time from inside your dashboard: open the "Manage
            billing / Cancel" button in the sidebar, which takes you to your
            secure Stripe billing portal. From there you can cancel your
            subscription directly — no need to contact us. If you'd rather
            we handle it for you, use "Contact support" in the same sidebar
            and we'll action it.
          </p>
        </Section>

        <Section title="Refunds">
          <p>
            Because billing is in advance for the coming month, cancelling
            stops future charges but does not automatically refund the
            current billing period already paid for. If you believe you were
            charged in error (e.g. billed after cancelling, or double-billed
            due to a technical fault), contact support with your business
            name and the charge date — we will review and refund
            genuine billing errors.
          </p>
          <p>
            This policy doesn't limit any refund or remedy you're entitled
            to under the Australian Consumer Law, which can't be excluded by
            this or any agreement.
          </p>
        </Section>

        <Section title="What happens to your data after cancelling">
          <p>
            Cancelling stops billing and access to paid features, but your
            account data isn't deleted immediately — see our{' '}
            <Link to="/privacy" style={inlineLink}>Privacy Policy</Link> for
            retention details and how to request full deletion.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Billing questions can be sent through "Contact support" inside
            your dashboard, or to the contact details in the footer of our
            homepage.
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
const inlineLink = { color: '#8fd0e8' }
