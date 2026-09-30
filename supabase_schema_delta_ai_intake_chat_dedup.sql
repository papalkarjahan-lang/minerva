-- ============================================================
-- MINERVA - Delta: idempotency key for ai-intake-chat lead capture
-- (2026-09-30). Run this once in the Supabase SQL Editor (or via the
-- Management API /database/query endpoint). Safe any time — additive
-- only, no data changes to existing rows.
--
-- WHY: ai-intake-chat has no server-side session row to claim against
-- (unlike voice-intake-agent's voice_call_sessions, keyed by Twilio
-- CallSid) — the full chat transcript is passed fresh from the browser
-- on every turn. If the browser's response is lost after the lead-capture
-- turn's server-side work completes (dropped connection, backgrounded
-- tab, a naive client-side retry), a resend of the same terminal turn
-- re-inserts the same lead and re-fires the business SMS + Slack post +
-- 'lead.created' workflow trigger a second time. Same claim-before-notify
-- bug class already fixed today in the sibling function voice-intake-agent
-- (claimed via a lead_captured flag on its own session row) and, before
-- that, detect-safety-hazards (claimed via insert-as-claim against a
-- partial unique index) — this uses the same insert-as-claim technique as
-- detect-safety-hazards, since ai-intake-chat has no separate session row
-- to flag: the leads insert itself IS the claim, keyed on a deterministic
-- hash of the exact transcript content. A genuinely new conversation from
-- the same visitor always has different transcript content (at minimum
-- one more turn), so this can only collide on a true duplicate of the
-- exact same capture turn.

alter table leads add column if not exists intake_dedup_key text;

create unique index if not exists idx_leads_intake_dedup_key
  on leads(business_id, intake_dedup_key)
  where intake_dedup_key is not null;
