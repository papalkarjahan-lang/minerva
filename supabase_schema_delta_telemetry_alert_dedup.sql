-- ============================================================
-- MINERVA - Delta: stop monitor-asset-telemetry from re-alerting on
-- every single ping while a geofence breach or maintenance threshold
-- stays crossed (2026-09-29). Run this once in the Supabase SQL
-- Editor (or via the Management API /database/query endpoint).
--
-- Every other alerting agent in the Industrial sector got a claim
-- column in the 2026-09-29 dedup pass (idle_flagged_at,
-- maintenance_predicted_at, route_suggested_at, reorder_requested_at,
-- escalated_at) — this one was missed because it's a real-time
-- ingestion endpoint, not a cron sweep, so the bug shape is different:
-- once a real telemetry feed is wired up and pings arrive every few
-- minutes, an asset sitting outside its geofence (or past its
-- maintenance-hours threshold) re-triggers a duplicate Slack alert AND
-- a duplicate asset_telemetry_events row on EVERY subsequent ping
-- until it moves back / gets serviced — not a rare race window, a
-- guaranteed flood.
--
-- Fix (in monitor-asset-telemetry/index.ts): alert once on the
-- transition into the breached/overdue state (claimed via these two
-- new columns being null), then clear the flag as soon as a later
-- ping shows the condition has resolved (back in geofence / serviced),
-- so the NEXT genuine crossing still alerts fresh. This also closes
-- the ordinary two-overlapping-requests TOCTOU window the rest of
-- this project's agents were already hardened against.
-- ============================================================

alter table industrial_assets add column if not exists geofence_breach_flagged_at timestamptz;
alter table industrial_assets add column if not exists maintenance_due_flagged_at timestamptz;
