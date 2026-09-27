// Pure logic extracted from respond-to-quote/index.ts so it can be
// unit-tested with Vitest — see other logic.ts files in this repo for the
// same pattern. index.ts imports this file directly.

// Only these two are legitimate client responses. 'draft'/'sent' are
// business-side states a client should never be able to set directly.
const RESPONDABLE_STATUSES = ['accepted', 'declined']

export function isValidResponseStatus(status: string | null): boolean {
  return !!status && RESPONDABLE_STATUSES.includes(status)
}

// A quote can only be responded to once it's actually been sent, and only
// while still awaiting a response — prevents a stale/replayed link from
// flipping an already-decided quote back and forth, and prevents responding
// to a quote the business hasn't sent yet (shouldn't be reachable, but the
// client controls the URL, not the server).
export function canRespond(currentStatus: string | null): boolean {
  return currentStatus === 'sent'
}
