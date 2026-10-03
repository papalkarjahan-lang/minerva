-- ============================================================
-- MINERVA — Delta: invoices.refunded_at, 2026-10-03.
-- Adds 1 new column only. Run this entire block once in the Supabase SQL
-- Editor.
--
-- What this fixes: stripe-webhook's new charge.refunded handling (see its
-- own header comment) previously only alerted a human — it deliberately
-- did NOT touch invoices.status, since introducing a new lifecycle value
-- needed a real decision about how DispatcherView/InvoiceView should
-- display it first. Now that decision is made: a refunded invoice gets
-- its own status:'refunded', distinct from 'void' (a 'void' invoice was
-- never actually paid; a refunded one genuinely was, then reversed — a
-- business's own bookkeeping cares about that difference, and so does
-- revenue reporting). paid_at is deliberately left untouched when a
-- refund happens — it genuinely was paid at that time, that fact doesn't
-- stop being true; refunded_at is a new, separate fact layered on top,
-- same relationship as voided_at has to the original creation.
-- ============================================================

alter table invoices add column refunded_at timestamptz;
