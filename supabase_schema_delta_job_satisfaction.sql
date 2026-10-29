-- ============================================================
-- MINERVA — Delta: client satisfaction pulse (2026-10-29)
--
-- WHY: the only existing client-sentiment signal is review_loop (a paid
-- Minerva Max add-on that sends a client to Google's own review page) —
-- no satisfaction data of any kind is ever captured back into Minerva
-- itself, paid or not. This adds a one-tap, real signal: a 👍/👎 shown
-- once a job is complete, captured directly, trend visible to the owner
-- without depending on Google at all.
--
-- Two new COLUMNS on the existing `jobs` table, not a new table — so this
-- is unaffected by Supabase's Oct 30 2026 Data API grant change (that
-- only concerns newly CREATED tables; existing tables keep their current
-- grants regardless of when a column is added to them).
-- ============================================================

alter table jobs add column if not exists client_satisfaction text; -- 'good' | 'not_great', null until submitted
alter table jobs add column if not exists client_satisfaction_at timestamptz;

-- Safe to run any time — idempotent (add column if not exists).
