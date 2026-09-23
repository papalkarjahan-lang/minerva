// Pure decision logic for followup-outreach, extracted so the 3/7/14-day
// staged-timing state machine (and the plain-template fallback body) can be
// unit tested with Vitest without a live Supabase connection, the Deno
// runtime, or waiting real days for a due date to arrive. index.ts imports
// these same functions and only adds the actual I/O (Supabase reads/writes,
// the Claude API call) around them — this file IS the production decision
// logic, not a reimplementation of it.

export const STAGE_DAYS = [3, 7, 14] // stage 1 = 3 days after sent_at, stage 2 = 7 days after stage-1 followup, stage 3 = 14 days after stage-2

export interface FollowupProspect {
  followup_stage: number | null
  sent_at: string | null
  last_followup_sent_at: string | null
}

export type FollowupDecision =
  | { action: 'close_lost' }
  | { action: 'wait' }
  | { action: 'due'; nextStage: number }

// Given a prospect row and the current time, decides whether to draft the
// next follow-up, wait, or give up after 3 unanswered tries. `nowMs` is
// passed in (not read from Date.now()) so this stays pure/testable.
export function computeFollowupDecision(p: FollowupProspect, nowMs: number): FollowupDecision {
  const stage = p.followup_stage || 0
  if (stage >= STAGE_DAYS.length) return { action: 'close_lost' }

  const daysNeeded = STAGE_DAYS[stage]
  const baseline = stage === 0 ? p.sent_at : p.last_followup_sent_at
  if (!baseline) return { action: 'wait' }

  const dueMs = new Date(baseline).getTime() + daysNeeded * 24 * 60 * 60 * 1000
  if (nowMs < dueMs) return { action: 'wait' }

  return { action: 'due', nextStage: stage + 1 }
}

export function fallbackFollowup(p: { contact_name: string | null; company_name: string | null }, stage: number): { subject: string; body: string } {
  const name = p.contact_name || 'there'
  return {
    subject: `Re: Quick question for ${p.company_name}`,
    body: `Hi ${name},\n\nJust following up (${stage === 1 ? 'my first note' : `follow-up #${stage}`}) — happy to answer any questions or just send over a link to try it free for 7 days, no pressure either way.\n\n(edit this before sending — this is the plain-template fallback, not an AI-personalized draft)`,
  }
}
