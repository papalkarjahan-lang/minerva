// /demo currently only shows dispatch (live tracking) and the whole-fleet
// optimizer. But invoicing, review requests, and win-back follow-up are
// already real, shipped, wired-up features (send-invoice-sms,
// chase-unpaid-invoices, send-review-request-sms, winback-lost-leads) —
// they're just never SHOWN anywhere a visitor would see them. This closes
// that gap: the exact message text below is representative of what those
// functions actually send, laid out as one sample timeline. Same honesty
// rule as the rest of this page — sample customer, sample numbers, real
// mechanism.
import { useReveal } from '../hooks/useReveal'
import { CheckCircleIcon, ReceiptIcon, StarIcon, BoltIcon } from './icons'

const STEPS = [
  {
    time: '2:41 PM',
    title: 'Job marked complete',
    detail: 'Dave marks the job done from his phone, on-site.',
    icon: CheckCircleIcon,
  },
  {
    time: '2:41 PM — same minute',
    title: 'Invoice sent, automatically',
    detail: 'No office admin touches this. The moment the job closes, Minerva texts the invoice.',
    icon: ReceiptIcon,
    sms: "Hi Sarah, here's your invoice for today's job: $340. Pay online: minerva.link/inv-8841",
  },
  {
    time: '4 days later',
    title: 'Review request sent',
    detail: 'Once the invoice is paid, one text asks for a review — timed to the right moment, not blasted to everyone.',
    icon: StarIcon,
    sms: 'Thanks for choosing us, Sarah! Mind leaving a quick review? minerva.link/rv-8841',
  },
  {
    time: '91 days later',
    title: 'A quiet customer gets a nudge',
    detail: "Minerva notices Thursday afternoons in Parramatta are under-booked, and texts lapsed customers nearby with an open slot that doesn't disrupt the day's route.",
    icon: BoltIcon,
    sms: "Hi James, it's been a while — we've got a Thursday 2-4pm slot open near you if you're due a check-up. Reply YES to book.",
  },
]

export default function AutomationTimeline() {
  return (
    <div style={{ maxWidth: 640, margin: '140px auto 0', padding: '0 24px', position: 'relative' }}>
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#8089a6', fontWeight: 600, marginBottom: 18 }}>
          <span style={{ width: 6, height: 6, borderRadius: 99, background: '#1D9E75', display: 'inline-block' }} />
          Runs on its own
        </div>
        <h2 style={{ fontSize: 'clamp(26px, 3.6vw, 34px)', fontWeight: 800, letterSpacing: '-0.015em', margin: '0 0 12px', textWrap: 'balance' }}>
          It keeps running after the van leaves.
        </h2>
        <p style={{ fontSize: 16, color: '#9aa4bc', margin: '0 auto', lineHeight: 1.6, maxWidth: 480 }}>
          Dispatch is the part people see. This is the part that actually runs the business day to day — the messages below are representative of the real ones Minerva sends, shown as one sample sequence.
        </p>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 19, top: 8, bottom: 8, width: 1, background: '#1b2336' }} />
        {STEPS.map((step, i) => (
          <Step key={step.title} step={step} index={i} isLast={i === STEPS.length - 1} />
        ))}
      </div>

      <p style={{ fontSize: 12.5, color: '#5c6684', textAlign: 'center', marginTop: 32, lineHeight: 1.6 }}>
        Invoicing is part of Pro. Win-back follow-up is part of Standard and Pro. Review requests are the Review Request Loop add-on. Sample customer, sample numbers — not a real job.
      </p>
    </div>
  )
}

function Step({ step, index, isLast }) {
  const [ref, shown] = useReveal()
  const Icon = step.icon
  return (
    <div
      ref={ref}
      style={{
        display: 'flex', gap: 18, marginBottom: isLast ? 0 : 34,
        opacity: shown ? 1 : 0, transform: shown ? 'translateY(0)' : 'translateY(10px)',
        transition: `opacity 0.5s ease-out ${index * 0.12}s, transform 0.5s ease-out ${index * 0.12}s`,
      }}
    >
      <div style={{
        flexShrink: 0, width: 40, height: 40, borderRadius: 99, background: '#101729',
        border: '1px solid #262f44', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#1D9E75', position: 'relative', zIndex: 1,
      }}>
        <Icon size={17} />
      </div>
      <div style={{ paddingTop: 2, minWidth: 0 }}>
        <div style={{ fontSize: 11.5, color: '#5c6684', fontWeight: 600, letterSpacing: '0.03em', marginBottom: 4, textTransform: 'uppercase' }}>
          {step.time}
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 6 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 13.5, color: '#9aa4bc', lineHeight: 1.55, marginBottom: step.sms ? 10 : 0, maxWidth: 440 }}>
          {step.detail}
        </div>
        {step.sms && (
          <div style={{
            display: 'inline-block', background: '#101729', border: '1px solid #1D9E75', color: '#dfe5f5',
            padding: '9px 13px', borderRadius: '12px 12px 12px 3px', fontSize: 12.5, lineHeight: 1.45, maxWidth: 400,
          }}>
            {step.sms}
          </div>
        )}
      </div>
    </div>
  )
}
