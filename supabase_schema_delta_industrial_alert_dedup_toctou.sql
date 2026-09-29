-- ============================================================
-- MINERVA - Delta: close TOCTOU dedup races in 3 Industrial-sector
-- alert agents (2026-09-29). Run this entire block once in the
-- Supabase SQL Editor (or via the Management API /database/query
-- endpoint).
--
-- Same bug class already fixed this session in stripe-webhook,
-- missed-call-webhook, industrial-conductor, track-consumables, and
-- optimize-industrial-routes: each of these 3 functions checked
-- "already flagged?" with a plain SELECT and only wrote its flag/row
-- AFTER acting — leaving a window where two overlapping runs (a slow
-- prior invocation still in flight when the next cron tick fires, or
-- an infra-level retry) could both pass the check before either had
-- claimed it, both firing a duplicate Slack alert (and, for
-- detect-safety-hazards, a duplicate safety_incidents ticket that now
-- needs independently triaging/closing).
--
-- detect-idle-assets and predict-asset-maintenance each get a claim
-- column on industrial_assets (same re-arm-after-suppress-window shape
-- as optimize-industrial-routes' route_suggested_at, added earlier
-- today). detect-safety-hazards instead gets a partial unique index —
-- it dedupes against a freshly-inserted safety_incidents row rather
-- than an existing entity's field, so the claim IS the insert: a
-- concurrent duplicate insert now fails with a unique-violation
-- (23505) instead of silently succeeding twice, mirroring
-- processed_call_sids/processed_stripe_events' insert-as-claim design.
-- ============================================================

alter table industrial_assets add column if not exists idle_flagged_at timestamptz;
alter table industrial_assets add column if not exists maintenance_predicted_at timestamptz;

-- Enforces "at most one open (unacknowledged) proximity-hazard incident
-- per site" at the database level. A second concurrent insert for the
-- same site_id + description while the first is still unacknowledged
-- now fails with a unique-violation instead of creating a duplicate
-- ticket.
create unique index if not exists safety_incidents_open_site_description_uniq
  on safety_incidents (site_id, description)
  where acknowledged_at is null;
