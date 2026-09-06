-- ============================================================
-- MINERVA — Delta: support_requests priority column (2026-09-06,
-- "build the support process" pass).
--
-- support_requests had a status ('open'/'resolved') but no way to tell
-- which open requests are urgent vs routine without reading every message
-- — with a sole-trader support team of one, that matters for triage.
-- ContactSupportModal.jsx now classifies priority client-side with a
-- simple keyword check (same "template classification, no AI required"
-- pattern already used by ai-intake-chat's EMERGENCY_KEYWORDS list) and
-- AdminConsole.jsx sorts/badges on it.
-- ============================================================

alter table support_requests add column if not exists priority text default 'normal'; -- 'urgent' | 'normal'
