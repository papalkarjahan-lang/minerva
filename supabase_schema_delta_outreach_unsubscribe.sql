-- ============================================================
-- MINERVA - Delta: outreach_prospects unsubscribe tracking (2026-09-16)
--
-- Why this exists: Minerva's own cold-outreach pipeline
-- (draft-outreach-batch / followup-outreach / send-outreach-batch) had no
-- way to record or honor an opt-out. Under the Australian Spam Act 2003
-- (Cth), commercial electronic messages must include a functional
-- unsubscribe facility and honor it. This delta adds the column; the
-- edge-function and AdminConsole.jsx changes that write/check it ship in
-- the same commit as this file.
--
-- NOTE: run this once in the Supabase SQL Editor. Safe to re-run (uses
-- `if not exists` guards throughout).
-- ============================================================

alter table outreach_prospects add column if not exists unsubscribed_at timestamptz;

create index if not exists idx_outreach_prospects_unsubscribed_at on outreach_prospects(unsubscribed_at);
