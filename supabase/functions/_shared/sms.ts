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
// (starting with "+") untouched. Assumes AU (+61) for any other bare
// national-format number, matching every call site's existing behaviour.
export function formatAuPhone(raw: string): string {
  let phone = raw.replace(/\s/g, '')
  if (phone.startsWith('0')) phone = '+61' + phone.slice(1)
  if (!phone.startsWith('+')) phone = '+61' + phone
  return phone
}

export function buildJobAssignmentMessage(opts: { techName?: string | null; businessName: string; clientName?: string | null; clientAddress?: string | null; when: string; isEmergency?: boolean }): string {
  const urgencyTag = opts.isEmergency ? ' [EMERGENCY]' : ''
  return `Hi ${opts.techName || ''}, new job assigned${urgencyTag} from ${opts.businessName}: ${opts.clientName || 'Client'} at ${opts.clientAddress || 'address on file'}, ${opts.when}. Open Minerva to view details.`.trim()
}

export function buildJobReassignmentMessage(opts: { techName?: string | null; clientAddress?: string | null }): string {
  return `Hi ${opts.techName || ''}, your job at ${opts.clientAddress || 'the scheduled address'} has been reassigned to someone else. If you're already on the way, contact your dispatcher.`
}

export function buildEtaMessage(opts: { clientName?: string | null; businessName: string; techName: string; trackingUrl: string }): string {
  return `Hi ${opts.clientName}, your ${opts.businessName} technician ${opts.techName} is approximately 15 minutes away.\n\nTrack them live: ${opts.trackingUrl}`
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
