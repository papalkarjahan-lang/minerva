// Pure logic extracted from client-support-chat/index.ts so it can be
// unit-tested with Vitest (Deno edge functions can't be imported into
// Node/Vitest directly — see other logic.ts files in this repo for the
// same pattern). index.ts imports this file directly, so this is the exact
// code that runs in production, not a reimplementation.

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

// Same cost-abuse guard as ai-intake-chat — public, unauthenticated endpoint.
export function isChatRequestTooLarge(messages: ChatMessage[]): boolean {
  return messages.length > 40 || messages.some(m => typeof m?.content !== 'string' || m.content.length > 2000)
}

// Anthropic's Messages API requires the first message to have role='user'
// — strips any leading assistant message (e.g. a widget's static greeting)
// so a conversation history that starts with one doesn't get rejected.
export function trimToFirstUserMessage(messages: ChatMessage[]): ChatMessage[] {
  let apiMessages = messages
  while (apiMessages.length && apiMessages[0].role !== 'user') apiMessages = apiMessages.slice(1)
  return apiMessages
}

export interface JobFacts {
  status: string
  technicianName?: string | null
  estimatedArrivalAt?: string | null
  scheduledTime?: string | null
}

export interface InvoiceFacts {
  total: number
  status: string
}

export interface BusinessFacts {
  name: string
  contactPhone?: string | null
}

// Deterministic fallback used whenever ANTHROPIC_API_KEY isn't configured
// — this is the path actually running in production right now (the key is
// currently unset). States the real fetched facts plainly rather than
// losing the feature, and never fabricates a number or status either way.
export function buildFallbackReply(business: BusinessFacts, job: JobFacts | null, invoice: InvoiceFacts | null): string {
  const parts: string[] = []
  if (job) {
    parts.push(`Job status: ${job.status}.`)
    if (job.technicianName) parts.push(`Technician: ${job.technicianName}.`)
    if (job.estimatedArrivalAt) parts.push(`Estimated arrival: ${new Date(job.estimatedArrivalAt).toLocaleString('en-AU')}.`)
    else if (job.scheduledTime) parts.push(`Scheduled: ${new Date(job.scheduledTime).toLocaleString('en-AU')}.`)
  }
  if (invoice) {
    parts.push(`Invoice total: $${Number(invoice.total).toFixed(2)}, status: ${invoice.status}.`)
  }
  parts.push(`For anything else, please contact ${business.name}${business.contactPhone ? ' on ' + business.contactPhone : ''} directly.`)
  return parts.join(' ')
}
