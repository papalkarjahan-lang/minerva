-- ============================================================
-- MINERVA - Delta: demand-forecast-aware marketing targeting (2026-09-06)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this enables: forecast-demand now writes a structured trend_address
-- alongside its existing prose summary, and generate-growth-drafts reads
-- the most recent one to surface an informational marketing suggestion —
-- the first real agent-to-agent data-sharing link between the Scheduling
-- and Marketing pillars (previously agent_insights was write-only, only
-- ever read by the human-facing agent-council-report digest). Purely
-- informational — never auto-creates a real draft or ad spend.
-- ============================================================

alter table agent_insights add column trend_address text;
