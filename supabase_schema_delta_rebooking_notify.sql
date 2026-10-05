-- ============================================================
-- MINERVA - Delta: notify on a client self-serve rebooking request
-- (2026-10-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this is for: TrackingView.jsx's "book me again" form writes
-- straight to `leads` (source='rebooking') on the assumption that
-- DispatcherView's realtime subscription on leads INSERT already covers
-- it — true only while the dispatcher's tab happens to be open at that
-- exact moment. Every other leads-creating path (ai-intake-chat,
-- voice-intake-agent) already sends an unconditional SMS+Slack
-- notification in addition to realtime; this was the one that didn't.
-- This column lets notify-rebooking-request send that notification ONCE
-- per rebooking request.
-- ============================================================

alter table leads add column rebooking_notified_at timestamptz;
