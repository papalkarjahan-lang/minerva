-- ============================================================
-- MINERVA — Delta: job-level referral code columns (2026-10-22).
--
-- What this fixes: the referral loop is marketed as available to every
-- paying tier ("NOT tier-gated — every paying customer gets this one
-- regardless of tier"), but send-referral-code-sms only ever fires from
-- DispatcherView's markInvoicePaid handler, and on-site invoicing (the
-- invoices table) is Pro-tier-exclusive. Starter and Standard businesses
-- never generate an invoices row at all, so they could never structurally
-- trigger it — a "sold vs. delivered" gap, same bug class fixed repeatedly
-- elsewhere in this project (Onboarding.jsx, SuccessPage.jsx).
--
-- Fix: give every job its own referral_code/referral_sms_failed pair,
-- mirroring invoices.referral_code/referral_sms_failed exactly (see
-- supabase_schema_delta_referral_sms_failed.sql), so a new job-keyed
-- function (send-job-referral-code-sms) can fire at job completion —
-- the one moment every tier actually has, not just Pro's invoice-paid
-- moment. That function tier-gates itself to skip Pro (which keeps its
-- existing, already-working invoice-paid trigger) so a Pro client is
-- never double-texted two different codes for the same job.
--
-- Run this once, alongside the agent_functions registration below.
-- ============================================================

alter table jobs add column if not exists referral_code text;
alter table jobs add column if not exists referral_sms_failed bool default false;

insert into agent_functions (name, agent) values
  ('send-job-referral-code-sms', 'core')
on conflict (name) do nothing;
