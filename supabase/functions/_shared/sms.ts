// Shared pure SMS helpers used by send-job-assignment-sms, send-eta-sms,
// send-completion-sms, send-invoice-sms, and send-review-request-sms.
// Deliberately dependency-free (no Deno/Supabase/Twilio imports) so these
// can be unit tested with Vitest without a live Twilio account or the Deno
// runtime — the same functions are imported directly by each edge
// function's index.ts, so this file IS the production message-building
// logic, not a reimplementation of it.
//
// Files starting with `_` are a Supabase CLI convention for "not its own
// deployable function" — only ever imported via a relative path by real
// functions, never deployed on its own.

// Normalizes an Australian mobile/landline number to E.164 for Twilio.
// Converts "0412 345 678" -> "+61412345678". Leaves an already-E.164 number
// for a DIFFERENT country (any "+" not followed by "61") untouched — not
// this function's job to guess. Assumes AU (+61) for any other bare
// national-format number, matching every call site's existing behaviour.
//
// Hardened 2026-10-03 while TWILIO_PHONE_NUMBER is still unset: every one
// of the 15 call sites has never sent a real SMS yet, so nothing has ever
// exercised this against a real-world number someone actually typed in —
// the same "never exercised against the real thing" risk that turned out
// to be real for the Claude model id elsewhere this round. Added two cases
// that were previously silently malformed instead of just rejected by
// Twilio outright:
//   - a bare country code with no "+" ("61412345678", easy to type when
//     copying a number from somewhere that already shows the country
//     code) previously got ANOTHER "+61" prepended on top of the existing
//     "61" ("+6161412345678") instead of just adding the missing "+".
//   - "+61" directly in front of the original 0-prefixed number
//     ("+610412345678", a common misconception: "just stick +61 on my
//     normal number") previously passed through untouched instead of
//     dropping the now-redundant leading 0.
// Also now strips dashes/parentheses, not just whitespace, since AU
// numbers are sometimes written "0412-345-678".
export function formatAuPhone(raw: string): string {
  const phone = raw.replace(/[\s()-]/g, '')
  if (phone.startsWith('+61')) return '+61' + phone.slice(3).replace(/^0/, '')
  if (phone.startsWith('+')) return phone
  let national = phone
  if (national.startsWith('61') && national.length === 11) national = national.slice(2)
  if (national.startsWith('0')) national = national.slice(1)
  return '+61' + national
}

export function buildJobAssignmentMessage(opts: { techName?: string | null; businessName: string; clientName?: string | null; clientAddress?: string | null; when: string; isEmergency?: boolean }): string {
  const urgencyTag = opts.isEmergency ? ' [EMERGENCY]' : ''
  return `Hi ${opts.techName || ''}, new job assigned${urgencyTag} from ${opts.businessName}: ${opts.clientName || 'Client'} at ${opts.clientAddress || 'address on file'}, ${opts.when}. Open Minerva to view details.`.trim()
}

export function buildJobReassignmentMessage(opts: { techName?: string | null; clientAddress?: string | null }): string {
  return `Hi ${opts.techName || ''}, your job at ${opts.clientAddress || 'the scheduled address'} has been reassigned to someone else. If you're already on the way, contact your dispatcher.`
}

// Last-mile speed assumption for etaPhraseFromDistance below — deliberately
// separate from optimize-daily-route's own AVG_SPEED_KMH (40). That one
// estimates travel between a technician's remaining jobs for the day, which
// can include open/highway-ish stretches; this message only ever fires once
// a technician is already within SMS_TRIGGER_KM (2km, TechnicianView.jsx) of
// the client, which in practice is local/residential streets with
// intersections and turns — slower than an open-road average, not the same
// number reused for a different situation.
const ETA_LOCAL_SPEED_KMH = 25

// Found 2026-10-10: this message previously hardcoded "approximately 15
// minutes away" unconditionally, regardless of the technician's actual
// distance — the SMS-trigger distance (2km) and a realistic local-street
// speed put the true range at roughly 1-5 minutes, so the fixed claim was
// routinely a significant overestimate, in the product's own flagship
// client-facing feature. distanceKm is optional (not every future caller
// may have it) — when absent, falls back to an honest, non-numeric phrase
// rather than reinstating a specific number that isn't backed by anything.
export function etaPhraseFromDistance(distanceKm?: number | null): string {
  if (distanceKm == null || distanceKm < 0 || !Number.isFinite(distanceKm)) return 'is on the way'
  const minutes = Math.max(1, Math.round((distanceKm / ETA_LOCAL_SPEED_KMH) * 60))
  return `is approximately ${minutes} minute${minutes === 1 ? '' : 's'} away`
}

export function buildEtaMessage(opts: { clientName?: string | null; businessName: string; techName: string; trackingUrl: string; distanceKm?: number | null }): string {
  return `Hi ${opts.clientName}, your ${opts.businessName} technician ${opts.techName} ${etaPhraseFromDistance(opts.distanceKm)}.\n\nTrack them live: ${opts.trackingUrl}`
}

export function buildCompletionMessage(opts: { clientName?: string | null; techName: string; businessName: string }): string {
  return `Hi ${opts.clientName}, ${opts.techName} from ${opts.businessName} has completed your job. Thank you for choosing us!`
}

export function buildInvoiceMessage(opts: { clientName?: string | null; businessName: string; invoiceUrl: string; total?: number | null }): string {
  const totalStr = typeof opts.total === 'number' ? `$${opts.total.toFixed(2)}` : ''
  return `Hi ${opts.clientName || 'there'}, here's your invoice from ${opts.businessName}${totalStr ? ` (${totalStr})` : ''}: ${opts.invoiceUrl}`
}

export function buildReviewRequestMessage(opts: { clientName?: string | null; businessName: string; trackingLink: string }): string {
  return `Hi ${opts.clientName || ''}, thanks for choosing ${opts.businessName}! If you have a moment, we'd really appreciate a quick review: ${opts.trackingLink}`.trim()
}

export function buildMissedCallSmsMessage(businessName: string): string {
  return `Thanks for calling ${businessName}! We missed you - reply here or call back and we'll help book your job.`
}

export function buildJobCancelledMessage(opts: { clientName?: string | null; businessName: string }): string {
  return `Hi ${opts.clientName || 'there'}, your job with ${opts.businessName} has been cancelled. Get in touch if you'd like to rebook.`
}

export function buildJobCancelledTechMessage(opts: { techName?: string | null; clientAddress?: string | null }): string {
  return `Hi ${opts.techName || ''}, the job at ${opts.clientAddress || 'the scheduled address'} has been cancelled — no need to go. Contact your dispatcher with any questions.`.trim()
}

export function buildJobRescheduledMessage(opts: { clientName?: string | null; businessName: string; when: string; previousWhen?: string | null }): string {
  const movedPhrase = opts.previousWhen ? `moved from ${opts.previousWhen} to ${opts.when}` : `rescheduled to ${opts.when}`
  return `Hi ${opts.clientName || 'there'}, your appointment with ${opts.businessName} has been ${movedPhrase}. Reply here if that doesn't work for you.`
}

export function buildJobRescheduledTechMessage(opts: { techName?: string | null; clientAddress?: string | null; when: string; previousWhen?: string | null }): string {
  const movedPhrase = opts.previousWhen ? `moved from ${opts.previousWhen} to ${opts.when}` : `rescheduled to ${opts.when}`
  return `Hi ${opts.techName || ''}, the job at ${opts.clientAddress || 'the scheduled address'} has been ${movedPhrase}.`.trim()
}
