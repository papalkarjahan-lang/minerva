-- ============================================================
-- MINERVA - Delta: voice_call_sessions (2026-09-13)
--
-- What this closes: the AI-Business-OS vision's #1 "AI receptionist" gap —
-- Minerva already has a text-chat AI intake widget (ai-intake-chat) but the
-- phone side only ever did a static <Say>+<Hangup/> plus an SMS auto-reply
-- (missed-call-webhook). This delta backs a real conversational voice
-- agent (voice-intake-agent edge function) that asks questions over the
-- phone via Twilio <Gather input="speech">, reusing the same lead-capture
-- shape/logic as ai-intake-chat.
--
-- Twilio's Voice webhook is stateless per HTTP round-trip — each spoken
-- turn is a brand-new POST to the function with no memory of prior turns
-- except what's threaded through the <Gather action="..."> URL or looked
-- up server-side. This table is that server-side memory, keyed by
-- Twilio's CallSid (unique per phone call), holding the same
-- {role, content}[] message shape ai-intake-chat already uses for
-- leads.transcript so the two paths can share code/expectations.
--
-- Not exposed to the browser at all — no anon RLS policy is added
-- (deliberately, unlike most tables in this schema). voice-intake-agent is
-- called exclusively by Twilio's servers and reads/writes this table with
-- the service_role key, same admin-client pattern missed-call-webhook
-- already uses to read businesses.twilio_number. RLS is enabled with zero
-- policies, so even a leaked anon key can't read live call transcripts.
--
-- Session rows are small and self-cleaning in spirit (a call rarely lasts
-- more than a few minutes) — no TTL/cleanup job added since Twilio CallSids
-- aren't reused and the volume at Minerva's current scale doesn't justify
-- a cron sweep yet; worth revisiting if call volume ever gets large.
--
-- NOTE: run this once in the Supabase SQL Editor (or via the Management
-- API /database/query endpoint, per minerva_supabase_function_deploy_method
-- memory).
-- ============================================================

create table if not exists voice_call_sessions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid references businesses(id) on delete cascade,
  call_sid        text not null unique, -- Twilio's CallSid, stable for the life of one phone call
  from_phone      text,                 -- caller's number (Twilio's "From")
  messages        jsonb not null default '[]'::jsonb, -- same {role, content}[] shape as leads.transcript
  lead_captured   boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table voice_call_sessions enable row level security;
-- Deliberately NO policies — service_role only, see header comment.

create index if not exists idx_voice_call_sessions_call_sid on voice_call_sessions(call_sid);
