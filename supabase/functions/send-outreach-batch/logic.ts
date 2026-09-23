// Pure decision logic for send-outreach-batch, extracted so the "what
// timestamps should this send actually update" branch can be unit tested
// with Vitest without a live Supabase/Resend connection or the Deno
// runtime. index.ts imports this same function and only adds the actual
// I/O (the send-email call, the Supabase update) around it — this file IS
// the production decision logic, not a reimplementation of it.

export interface SentProspect {
  sent_at: string | null
  followup_stage: number | null
}

export interface SentUpdates {
  status: 'sent'
  sent_at?: string
  last_followup_sent_at?: string
}

// sent_at is the original first-touch time and must never be overwritten
// once set. followup-outreach uses last_followup_sent_at (not sent_at) as
// its baseline for stage 2/3 timing once at least one follow-up has gone
// out, so a follow-up send (followup_stage > 0) must update that field
// instead.
export function computeSentUpdates(p: SentProspect, nowIso: string): SentUpdates {
  const updates: SentUpdates = { status: 'sent' }
  if (!p.sent_at) updates.sent_at = nowIso
  if ((p.followup_stage || 0) > 0) updates.last_followup_sent_at = nowIso
  return updates
}
