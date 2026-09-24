-- ============================================================
-- MINERVA — stripe-webhook event idempotency (2026-09-24, Round 44).
--
-- Stripe's own docs explicitly call out that webhook deliveries can be
-- retried (network timeout, non-2xx response, occasional duplicate
-- delivery even on success) and recommend deduping by event.id. This
-- codebase's stripe-webhook/index.ts had no such check: every branch's
-- database write is itself idempotent (plain UPDATEs re-writing the same
-- values), but two of the five branches also fire a best-effort email as
-- a SIDE EFFECT of processing the event —
--   - checkout.session.completed sends the "You're live on Minerva"
--     welcome email
--   - invoice.payment_failed sends the operator payment-failed alert
-- A retried delivery of the same event would resend either email every
-- time Stripe retries, with no bound on how many times. Real, narrow
-- (annoying, not financially harmful — the DB state itself was always
-- correct either way), but worth closing given the "no client/operator
-- ever gets spammed by a retry" discipline already applied everywhere
-- else in this codebase (e.g. the outreach unsubscribe-check, the
-- draft-outreach-batch one-clean-email-per-prospect design).
--
-- processed_stripe_events: minimal table, service_role-only (same
-- no-anon-policy pattern as rate_limit_counters/voice_call_sessions —
-- nothing here is ever read/written by anon or authenticated roles).
-- index.ts checks event.id against this table right after signature
-- verification; if already present, returns 200 immediately without
-- re-running any branch. Row is inserted only after the event's branch
-- has fully completed without throwing, so a genuine mid-processing
-- failure (which returns 500, causing Stripe to legitimately retry) is
-- correctly NOT marked as processed.
--
-- Run once in the Supabase SQL Editor, or via the Management API.
-- ============================================================

create table if not exists processed_stripe_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz not null default now()
);

alter table processed_stripe_events enable row level security;

grant select, insert on processed_stripe_events to service_role;
