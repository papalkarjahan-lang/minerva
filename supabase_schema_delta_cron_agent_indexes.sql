-- ============================================================
-- MINERVA — index coverage for the double-send-race cron agents
-- (2026-09-24, Round 44 continued further still).
--
-- Follow-up to the SELECT-then-send-then-mark double-send race fix applied
-- to chase-unpaid-invoices, retention-checkin, nurture-stale-leads, and
-- winback-lost-leads earlier the same day. That fix made each function's
-- claim-before-send query CORRECT; this migration makes those same queries
-- (and the original SELECTs they mirror) FAST at scale — verified via
-- pg_indexes that invoices/leads/jobs currently only have primary-key and
-- foreign-key indexes, nothing on the status/*_sent_at columns these crons
-- filter on every single run (hourly for nurture-stale-leads). Tables are
-- near-empty pre-launch (0-1 rows each at time of writing) so this is not
-- an active incident — it's cheap, safe, verified scale-readiness done
-- while the exact predicates are fresh from just having fixed the queries
-- themselves, rather than waiting for a real table-scan slowdown to
-- rediscover the same gap later.
--
-- Each index is a PARTIAL index matching the exact WHERE clause of the
-- function that uses it (not a generic composite), since every one of
-- these queries only ever cares about a narrow slice of rows (e.g. only
-- 'unpaid' invoices, only 'new' leads not yet on their 2nd touch) — a
-- partial index is smaller, cheaper to maintain, and a better match for
-- the planner than indexing the whole table.
-- ============================================================

-- chase-unpaid-invoices: WHERE status='unpaid' AND (reminder_sent_at IS
-- NULL OR reminder_sent_at < threeDaysAgo)
create index if not exists idx_invoices_unpaid_reminder
  on invoices (reminder_sent_at)
  where status = 'unpaid';

-- nurture-stale-leads, 1st touch: WHERE status='new' AND nurture_sent_at
-- IS NULL AND created_at < twoHoursAgo
create index if not exists idx_leads_new_pending_nurture
  on leads (created_at)
  where status = 'new' and nurture_sent_at is null;

-- nurture-stale-leads, 2nd touch: WHERE status='new' AND nurture_sent_at
-- NOT NULL AND second_nurture_sent_at IS NULL AND nurture_sent_at < 24h ago
create index if not exists idx_leads_new_pending_second_nurture
  on leads (nurture_sent_at)
  where status = 'new' and second_nurture_sent_at is null;

-- winback-lost-leads: WHERE status='lost' AND lost_winback_sent_at IS NULL
-- AND created_at < 14 days ago
create index if not exists idx_leads_lost_pending_winback
  on leads (created_at)
  where status = 'lost' and lost_winback_sent_at is null;

-- retention-checkin: WHERE status='complete' AND retention_sent_at IS NULL
-- AND completed_at BETWEEN 60d and 30d ago
create index if not exists idx_jobs_complete_pending_retention
  on jobs (completed_at)
  where status = 'complete' and retention_sent_at is null;

-- retention-checkin's "already has a newer job" sub-query: WHERE
-- business_id=X AND client_phone=Y AND created_at > completed_at
create index if not exists idx_jobs_business_phone_created
  on jobs (business_id, client_phone, created_at);

-- Note: businesses.twilio_number (used by missed-call-webhook to look up
-- the business for an inbound call) already has a UNIQUE index
-- (businesses_twilio_number_unique) — checked, no gap there.
