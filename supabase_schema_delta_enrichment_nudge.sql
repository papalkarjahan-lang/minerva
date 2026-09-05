-- ============================================================
-- MINERVA - Delta: enrichment nudge suppression (2026-09-05)
-- Adds 1 new column only. Nothing else in your live DB is touched, so this
-- won't hit an "already exists" error (see supabase_schema_missing.sql for
-- why that matters — a failed statement rolls back the whole paste).
-- Run this entire block once in the Supabase SQL Editor.
--
-- What this fixes: enrich-industrial-leads' daily cron sweep Slack-nudges
-- every industrial_leads row still status='new' with no decision-maker
-- contact — but had no equivalent of leads.escalation_flagged_at, so it
-- re-nudged the SAME unenriched lead every single day forever. This column
-- lets the sweep flag each lead once and skip it on future runs until it's
-- actually enriched (status changes away from 'new', which naturally drops
-- it out of the query regardless of this column).
-- ============================================================

alter table industrial_leads add column enrichment_nudge_sent_at timestamptz;
