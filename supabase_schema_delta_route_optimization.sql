-- Multi-stop daily route optimization (added 2026-09-14)
-- Purely additive. Nothing about existing dispatch (auto-assign-technician,
-- send-eta-sms, the live map) changes — this adds an optional ordering on
-- top of jobs a technician already has for a given day, so a dispatcher (or
-- the technician themselves) can see the most efficient visiting order
-- instead of whatever order jobs happen to be listed/scheduled in.

alter table jobs add column if not exists route_sequence int;
-- Nullable. Set by optimize-daily-route for a technician's jobs on a given
-- day; null means "not yet optimized" or "optimization not used for this
-- business" — existing job lists simply ignore it and keep sorting by
-- scheduled_time as they always have, so this is fully backward compatible.

alter table jobs add column if not exists estimated_arrival_at timestamptz;
-- Nullable. optimize-daily-route's estimate of when the technician will
-- reach this stop, computed by chaining haversine distances at an assumed
-- average travel speed — an honest estimate from real coordinates, not a
-- live-traffic-aware ETA (no traffic-data source exists in this build).
