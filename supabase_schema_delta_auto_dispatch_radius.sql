-- ============================================================
-- MINERVA — Delta: geofenced auto-dispatch radius (2026-09-05)
-- Adds 1 new column only. Nothing else in your live DB is touched.
--
-- What this adds: auto-assign-technician currently always picks the
-- nearest free technician, however far away — a job could get
-- auto-dispatched to someone 150km out if everyone closer happens to be
-- busy, which is worse than just leaving it unassigned for a human to
-- reroute or call a subcontractor. This column lets a business cap that.
--
-- null (the default) = unlimited, exact same behaviour as today. Nothing
-- changes for any business until they set a real number in the Settings
-- modal (see DispatcherView.jsx's Settings — "Max auto-dispatch distance").
-- ============================================================

alter table businesses add column auto_dispatch_max_km numeric;
